import * as pdfjsLib from "pdfjs-dist";
import type { GeometricField, FieldUnit, FieldCluster } from "./fieldData";
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
      // Check substring overlap
      const overlap = sentLower.length > 0 && groupLower.includes(sentLower.slice(0, 40))
        ? sentLower.length
        : commonWordOverlap(sentLower, groupLower);
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestMatch = group;
      }
    }

    if (bestMatch && bestOverlap > 5) {
      // Convert normalized page position to field coordinates [-3.5, 3.5]
      return [
        bestMatch.normPos.x * 7 - 3.5,
        bestMatch.normPos.y * 7 - 3.5,
      ] as [number, number];
    }
    return null;
  });

  // Blend: weight spatial vs semantic based on diagram confidence
  const spatialWeight = diagramConfidence * 0.7; // max 70% spatial
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
  // Run text extraction and spatial analysis in parallel
  onProgress?.("Extracting text & analyzing layout…", 0.1);
  const [sentences, spatialItems] = await Promise.all([
    extractTextFromPDF(file),
    extractSpatialText(file),
  ]);

  if (sentences.length < 5) {
    throw new Error("PDF contains too little text to generate a meaningful field. Need at least 5 sentences.");
  }

  onProgress?.("Detecting spatial structures…", 0.25);
  const spatialGroups = detectSpatialGroups(spatialItems);
  const { isDiagram, confidence: diagramConfidence } = detectDiagramLayout(spatialGroups);

  // Cap at 80 sentences for performance
  const capped = sentences.length > 80 ? sentences.slice(0, 80) : sentences;

  onProgress?.("Computing TF-IDF vectors…", 0.35);
  const { vectors } = computeTFIDF(capped);

  const k = Math.min(5, Math.max(3, Math.floor(capped.length / 6)));

  onProgress?.("Clustering semantic units…", 0.5);
  const assignments = kMeans(vectors, k);

  onProgress?.("Projecting to 2D field…", 0.65);
  const semanticCoords = projectTo2D(vectors);

  onProgress?.(
    isDiagram ? "Blending spatial layout with semantics…" : "Generating field topology…",
    0.8
  );
  const coords2D = blendCoordinates(semanticCoords, spatialGroups, capped, diagramConfidence);

  const clusterLabels = generateClusterLabels(capped, assignments, k);

  // Build FieldUnits
  const units: FieldUnit[] = capped.map((text, i) => {
    const clusterId = assignments[i];
    const clusterMembers = coords2D.filter((_, j) => assignments[j] === clusterId);
    const centroid: [number, number] = [
      clusterMembers.reduce((s, c) => s + c[0], 0) / (clusterMembers.length || 1),
      clusterMembers.reduce((s, c) => s + c[1], 0) / (clusterMembers.length || 1),
    ];
    const dist = Math.sqrt((coords2D[i][0] - centroid[0]) ** 2 + (coords2D[i][1] - centroid[1]) ** 2);
    const fz = Math.min(1, dist / 4 + 0.1);
    const fy = Math.max(0, 1 - dist / 3);

    const wordCount = text.split(/\s+/).length;
    const type: FieldUnit["type"] = wordCount < 8 ? "fragment" : wordCount > 25 ? "paragraph" : "heading";

    return {
      id: `u${i}`,
      text,
      pos: { x: (coords2D[i][0] + 4) / 8, y: (coords2D[i][1] + 4) / 8 },
      vector2d: coords2D[i],
      clusterId,
      type,
      fz: Math.round(fz * 100) / 100,
      fy: Math.round(fy * 100) / 100,
    };
  });

  // Build clusters
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
