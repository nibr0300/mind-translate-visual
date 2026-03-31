import * as pdfjsLib from "pdfjs-dist";
import type { GeometricField, FieldUnit, FieldCluster } from "./fieldData";
import { extractOcrUnitsFromPDF } from "./pdfOcr";
import {
  extractSpatialText,
  detectSpatialGroups,
  detectDiagramLayout,
  type SpatialGroup,
} from "./spatialAnalyzer";
import {
  computeTFIDF,
  kMeans,
  projectTo2D,
  generateClusterLabels,
} from "./textAnalyzer";
import {
  analyzeIntentions,
  blendFZWithIntention,
  triangulateTruthTension,
  computeClusterDeviation,
  type IntentionAnalysis,
} from "./intentionAnalyzer";
import { analyzeHedgingBatch } from "./hedgingAnalyzer";

// Configure pdf.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs`;

/** Extract all text from a PDF file (sentence-level) */
export async function extractTextFromPDF(file: File): Promise<string[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const sentences: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .filter((item: any) => "str" in item)
      .map((item: any) => item.str)
      .join(" ");

    const pageSentences = pageText
      .replace(/\s+/g, " ")
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 15);

    sentences.push(...pageSentences);
  }

  return sentences;
}

/** Extract text units from spatial groups (for diagram-heavy PDFs) */
function extractUnitsFromSpatialGroups(spatialGroups: SpatialGroup[]): string[] {
  return spatialGroups
    .map((g) => g.text.replace(/\s+/g, " ").trim())
    .filter((t) => t.length >= 3);
}

function mergeTextUnits(...unitSets: string[][]): string[] {
  const seen = new Set<string>();

  return unitSets
    .flat()
    .map((unit) => unit.replace(/\s+/g, " ").trim())
    .filter((unit) => unit.length >= 3)
    .filter((unit) => {
      const key = unit.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function shouldUseOcrFallback(sentences: string[], spatialGroups: SpatialGroup[]): boolean {
  const nonWhitespaceChars = sentences.join(" ").replace(/\s+/g, "").length;
  return sentences.length < 5 || nonWhitespaceChars < 120 || spatialGroups.length < 3;
}

/**
 * Blend spatial positions with PCA-projected semantic positions.
 *
 * When the document contains diagram-like layouts, spatial positions
 * from the page are weighted more heavily. For prose-heavy documents,
 * semantic (TF-IDF/PCA) positions dominate.
 *
 * @param semanticCoords - PCA-projected coordinates from TF-IDF
 * @param spatialGroups - Detected spatial groups (may be fewer than sentences)
 * @param sentences - Original text units
 * @param diagramConfidence - 0..1 how diagram-like the layout is
 */
function blendCoordinates(
  semanticCoords: [number, number][],
  spatialGroups: SpatialGroup[],
  sentences: string[],
  diagramConfidence: number
): [number, number][] {
  if (spatialGroups.length === 0 || diagramConfidence < 0.2) {
    return semanticCoords;
  }

  // Map each sentence to its best-matching spatial group
  const spatialPositions: ([number, number] | null)[] = sentences.map((sentence) => {
    let bestMatch: SpatialGroup | null = null;
    let bestOverlap = 0;

    const sentLower = sentence.toLowerCase();
    for (const group of spatialGroups) {
      const groupLower = group.text.toLowerCase();
      const overlap = sentLower.length > 0 && groupLower.includes(sentLower.slice(0, 40))
        ? sentLower.length
        : commonWordOverlap(sentLower, groupLower);

      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestMatch = group;
      }
    }

    if (bestMatch && bestOverlap >= Math.min(5, sentLower.length)) {
      return [
        bestMatch.normPos.x * 7 - 3.5,
        bestMatch.normPos.y * 7 - 3.5,
      ] as [number, number];
    }

    return null;
  });

  const spatialWeight = diagramConfidence * 0.7;
  const semanticWeight = 1 - spatialWeight;

  return semanticCoords.map((semantic, i) => {
    const spatial = spatialPositions[i];
    if (!spatial) return semantic;

    return [
      semantic[0] * semanticWeight + spatial[0] * spatialWeight,
      semantic[1] * semanticWeight + spatial[1] * spatialWeight,
    ] as [number, number];
  });
}

/** Count common words between two strings */
function commonWordOverlap(a: string, b: string): number {
  const wordsA = new Set(a.split(/\s+/).filter((w) => w.length > 3));
  const wordsB = new Set(b.split(/\s+/).filter((w) => w.length > 3));
  let count = 0;

  for (const w of wordsA) {
    if (wordsB.has(w)) count++;
  }

  return count;
}

/** Main: process PDF into GeometricField */
export async function generateFieldFromPDF(
  file: File,
  onProgress?: (stage: string, progress: number) => void
): Promise<GeometricField> {
  onProgress?.("Extracting text & analyzing layout…", 0.08);
  const [rawSentences, spatialItems] = await Promise.all([
    extractTextFromPDF(file),
    extractSpatialText(file),
  ]);

  let spatialGroups = detectSpatialGroups(spatialItems);
  let ocrTextUnits: string[] = [];

  if (shouldUseOcrFallback(rawSentences, spatialGroups)) {
    try {
      onProgress?.("Running OCR fallback for image-based pages…", 0.18);
      const ocrResult = await extractOcrUnitsFromPDF(file, (progress) => {
        onProgress?.("Running OCR fallback for image-based pages…", 0.18 + progress * 0.18);
      });

      ocrTextUnits = ocrResult.textUnits;
      if (ocrResult.spatialGroups.length > 0) {
        spatialGroups = [...spatialGroups, ...ocrResult.spatialGroups];
      }
    } catch (error) {
      console.warn("OCR fallback failed", error);
    }
  }

  onProgress?.("Detecting spatial structures…", 0.38);
  const { isDiagram, confidence: diagramConfidence } = detectDiagramLayout(spatialGroups);

  let sentences = rawSentences;
  if (sentences.length < 5 && spatialGroups.length >= 3) {
    sentences = mergeTextUnits(rawSentences, extractUnitsFromSpatialGroups(spatialGroups), ocrTextUnits);
  } else if (sentences.length < 5 && ocrTextUnits.length > 0) {
    sentences = mergeTextUnits(rawSentences, ocrTextUnits);
  }

  if (sentences.length < 3) {
    throw new Error("PDF contains too little text to generate a meaningful field, even after OCR. Need at least 3 text units.");
  }

  const capped = sentences.length > 80 ? sentences.slice(0, 80) : sentences;

  onProgress?.("Computing TF-IDF vectors…", 0.45);
  const { vectors } = computeTFIDF(capped);

  const k = Math.min(5, Math.max(2, Math.floor(capped.length / 6)));

  onProgress?.("Clustering semantic units…", 0.55);
  const assignments = kMeans(vectors, k);

  onProgress?.("Analyzing intentions & truth-seeking…", 0.65);
  const intentionResults = await analyzeIntentions(capped);

  onProgress?.("Projecting to 2D field…", 0.78);
  const semanticCoords = projectTo2D(vectors);

  onProgress?.(
    isDiagram ? "Blending spatial layout with semantics…" : "Generating field topology…",
    0.88
  );
  const coords2D = blendCoordinates(semanticCoords, spatialGroups, capped, diagramConfidence);

  const clusterLabels = generateClusterLabels(capped, assignments, k);

  // Build a lookup map for intention results
  const intentionMap = new Map<number, IntentionAnalysis>();
  if (intentionResults) {
    for (const a of intentionResults) {
      intentionMap.set(a.index, a);
    }
  }

  const units: FieldUnit[] = capped.map((text, i) => {
    const clusterId = assignments[i];
    const clusterMembers = coords2D.filter((_, j) => assignments[j] === clusterId);
    const centroid: [number, number] = [
      clusterMembers.reduce((s, c) => s + c[0], 0) / (clusterMembers.length || 1),
      clusterMembers.reduce((s, c) => s + c[1], 0) / (clusterMembers.length || 1),
    ];
    const dist = Math.sqrt((coords2D[i][0] - centroid[0]) ** 2 + (coords2D[i][1] - centroid[1]) ** 2);
    const lexicalFZ = Math.min(1, dist / 4 + 0.1);
    const fy = Math.max(0, 1 - dist / 3);

    const intention = intentionMap.get(i);
    const fz = intention ? blendFZWithIntention(lexicalFZ, intention) : Math.round(lexicalFZ * 100) / 100;

    const wordCount = text.split(/\s+/).length;
    const type: FieldUnit["type"] = wordCount < 8 ? "fragment" : wordCount > 25 ? "paragraph" : "heading";

    return {
      id: `u${i}`,
      text,
      pos: { x: (coords2D[i][0] + 4) / 8, y: (coords2D[i][1] + 4) / 8 },
      vector2d: coords2D[i],
      clusterId,
      type,
      fz,
      fy: Math.round(fy * 100) / 100,
      ...(intention && {
        intention: {
          speechAct: intention.speechAct,
          epistemicCertainty: intention.epistemicCertainty,
          intentionalForce: intention.intentionalForce,
          truthTension: intention.truthTension,
        },
      }),
    };
  });

  const clusters: FieldCluster[] = Array.from({ length: k }, (_, i) => {
    const clusterUnits = units.filter((u) => u.clusterId === i);
    const center: [number, number] = clusterUnits.length
      ? [
          clusterUnits.reduce((s, u) => s + u.vector2d[0], 0) / clusterUnits.length,
          clusterUnits.reduce((s, u) => s + u.vector2d[1], 0) / clusterUnits.length,
        ]
      : [0, 0];

    return {
      id: i,
      label: clusterLabels[i].label,
      center,
      unitCount: clusterUnits.length,
      avgFZ: clusterUnits.length ? clusterUnits.reduce((s, u) => s + u.fz, 0) / clusterUnits.length : 0,
      avgFY: clusterUnits.length ? clusterUnits.reduce((s, u) => s + u.fy, 0) / clusterUnits.length : 0,
      description: clusterLabels[i].description,
    };
  });

  const boundaryUnits = units.filter((u) => u.fz > 0.65).length;

  onProgress?.("Field ready", 1);

  return {
    units,
    clusters,
    stats: {
      totalUnits: units.length,
      boundaryUnits,
      avgFZ: units.reduce((s, u) => s + u.fz, 0) / units.length,
      avgFY: units.reduce((s, u) => s + u.fy, 0) / units.length,
    },
    useCase: isDiagram ? "uploaded-diagram" : "uploaded",
  };
}
