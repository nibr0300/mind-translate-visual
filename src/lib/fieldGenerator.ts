/**
 * Multimodal field generator + vector-DB persistence layer.
 *
 * - PDF goes through the existing spatial-aware pipeline (`generateFieldFromPDF`).
 * - All other types (text, script, image, audio, zip) go through:
 *     adapter -> chunker -> TF-IDF/kmeans/intention/CTI
 * - After the field is built, embed + persist runs in the background:
 *     embed-chunks -> persist-field (documents + chunks + clusters_summary)
 */
import type { GeometricField, FieldUnit, FieldCluster } from "./fieldData";
import { extractFromFile, detectSourceType, type SourceType } from "./inputAdapters";
import { chunkUnits, type Chunk } from "./chunker";
import { sha256Hex } from "./contentHash";
import { generateFieldFromPDF } from "./pdfFieldGenerator";
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
  computeCTI,
  type IntentionAnalysis,
} from "./intentionAnalyzer";
import { analyzeHedgingBatch } from "./hedgingAnalyzer";
import { supabase } from "@/integrations/supabase/client";

export type ProgressCb = (stage: string, value: number) => void;

export async function generateFieldFromFile(
  file: File,
  onProgress?: ProgressCb
): Promise<GeometricField> {
  const sourceType = detectSourceType(file);

  let field: GeometricField;
  let chunks: Chunk[];

  if (sourceType === "pdf") {
    field = await generateFieldFromPDF(file, onProgress);
    // Re-derive chunks from the field's units for persistence
    chunks = field.units.map((u, i) => ({
      index: i,
      text: u.text,
      source: file.name,
      startPosition: i,
    }));
  } else {
    onProgress?.(`Extracting ${sourceType}…`, 0.08);
    const { units: rawUnits } = await extractFromFile(file);

    if (rawUnits.length === 0) {
      throw new Error(`No text could be extracted from this ${sourceType} file.`);
    }

    onProgress?.("Chunking content…", 0.2);
    chunks = chunkUnits(rawUnits);

    if (chunks.length < 3) {
      throw new Error("Content too short to build a meaningful field (min 3 chunks).");
    }

    const capped = chunks.length > 200 ? chunks.slice(0, 200) : chunks;
    chunks = capped;

    field = await buildFieldFromChunks(capped, sourceType, onProgress);
  }

  // Background: embed + persist. Don't block UI on it.
  void persistFieldInBackground(field, chunks, file, sourceType).catch((err) => {
    console.warn("[persist] failed:", err);
  });

  return field;
}

/** Build a GeometricField from already-chunked text (non-PDF path). */
async function buildFieldFromChunks(
  chunks: Chunk[],
  sourceType: SourceType,
  onProgress?: ProgressCb
): Promise<GeometricField> {
  const texts = chunks.map((c) => c.text);

  onProgress?.("Computing TF-IDF vectors…", 0.4);
  const { vectors } = computeTFIDF(texts);

  const k = Math.min(5, Math.max(2, Math.floor(texts.length / 6)));

  onProgress?.("Clustering semantic units…", 0.5);
  const assignments = kMeans(vectors, k);

  onProgress?.("Analyzing intentions…", 0.6);
  const [intentionResults, hedgingScores] = await Promise.all([
    analyzeIntentions(texts),
    Promise.resolve(analyzeHedgingBatch(texts)),
  ]);

  onProgress?.("Projecting to 2D field…", 0.78);
  const coords2D = projectTo2D(vectors);
  const clusterLabels = generateClusterLabels(texts, assignments, k);

  const intentionMap = new Map<number, IntentionAnalysis>();
  if (intentionResults) for (const a of intentionResults) intentionMap.set(a.index, a);

  const clusterIntentionGroups = new Map<number, IntentionAnalysis[]>();
  if (intentionResults) {
    for (const a of intentionResults) {
      const cId = assignments[a.index];
      if (!clusterIntentionGroups.has(cId)) clusterIntentionGroups.set(cId, []);
      clusterIntentionGroups.get(cId)!.push(a);
    }
  }

  onProgress?.("Triangulating truth tension…", 0.9);

  const units: FieldUnit[] = texts.map((text, i) => {
    const clusterId = assignments[i];
    const members = coords2D.filter((_, j) => assignments[j] === clusterId);
    const centroid: [number, number] = [
      members.reduce((s, c) => s + c[0], 0) / (members.length || 1),
      members.reduce((s, c) => s + c[1], 0) / (members.length || 1),
    ];
    const dist = Math.sqrt(
      (coords2D[i][0] - centroid[0]) ** 2 + (coords2D[i][1] - centroid[1]) ** 2
    );
    const lexicalFZ = Math.min(1, dist / 4 + 0.1);
    const fy = Math.max(0, 1 - dist / 3);

    const intention = intentionMap.get(i);
    const hedging = hedgingScores[i];
    const clusterDeviation = intention
      ? computeClusterDeviation(intention, clusterIntentionGroups.get(clusterId) || [])
      : 0;

    const triangulation = triangulateTruthTension(
      intention?.truthTension ?? null,
      hedging,
      intention?.speechAct ?? null,
      clusterDeviation
    );

    const fz = intention
      ? blendFZWithIntention(
          lexicalFZ,
          triangulation.triangulated,
          intention.epistemicCertainty,
          intention.intentionalForce
        )
      : Math.round(lexicalFZ * 100) / 100;

    const wordCount = text.split(/\s+/).length;
    const type: FieldUnit["type"] =
      wordCount < 8 ? "fragment" : wordCount > 25 ? "paragraph" : "heading";

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
      triangulation: {
        llmTension: triangulation.llmTension,
        lexicalTension: triangulation.lexicalTension,
        discrepancy: triangulation.discrepancy,
        clusterDeviation: triangulation.clusterDeviation,
        triangulated: triangulation.triangulated,
      },
      cti: computeCTI(triangulation.discrepancy, triangulation.clusterDeviation),
    };
  });

  const clusters: FieldCluster[] = Array.from({ length: k }, (_, i) => {
    const cu = units.filter((u) => u.clusterId === i);
    const center: [number, number] = cu.length
      ? [
          cu.reduce((s, u) => s + u.vector2d[0], 0) / cu.length,
          cu.reduce((s, u) => s + u.vector2d[1], 0) / cu.length,
        ]
      : [0, 0];
    return {
      id: i,
      label: clusterLabels[i].label,
      center,
      unitCount: cu.length,
      avgFZ: cu.length ? cu.reduce((s, u) => s + u.fz, 0) / cu.length : 0,
      avgFY: cu.length ? cu.reduce((s, u) => s + u.fy, 0) / cu.length : 0,
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
    useCase: `uploaded-${sourceType}`,
  };
}

/* ============================================================ *
 *  Persistence: embed + write to the vector DB in the background
 * ============================================================ */

async function persistFieldInBackground(
  field: GeometricField,
  chunks: Chunk[],
  file: File,
  sourceType: SourceType
): Promise<void> {
  // Build embed items with augmentation metadata
  const items = field.units.map((u, i) => ({
    text: u.text,
    docName: file.name,
    clusterLabel: field.clusters[u.clusterId]?.label,
    speechAct: u.intention?.speechAct,
    certainty: u.intention?.epistemicCertainty,
  }));

  const { data: embedData, error: embedErr } = await supabase.functions.invoke("embed-chunks", {
    body: { items },
  });
  if (embedErr) throw embedErr;

  const { embeddings, dim } = embedData as { embeddings: number[][]; dim: number };
  if (!embeddings || embeddings.length !== field.units.length) {
    throw new Error("Embedding count mismatch");
  }

  // Compute per-chunk content hashes
  const hashes = await Promise.all(field.units.map((u) => sha256Hex(u.text)));

  const chunkPayload = field.units.map((u, i) => ({
    chunk_index: i,
    text: u.text,
    content_hash: hashes[i],
    source_path: chunks[i]?.source ?? file.name,
    cluster_id: u.clusterId,
    cluster_label: field.clusters[u.clusterId]?.label,
    fz: u.fz,
    fy: u.fy,
    cti: u.cti,
    triangulation: u.triangulation,
    intention: u.intention,
    embedding: embeddings[i],
  }));

  // Centroid embedding per cluster = mean of member embeddings
  const clusterPayload = field.clusters.map((c) => {
    const memberIdxs = field.units
      .map((u, i) => (u.clusterId === c.id ? i : -1))
      .filter((i) => i >= 0);
    const centroid = new Array(dim).fill(0);
    for (const idx of memberIdxs) {
      const e = embeddings[idx];
      for (let d = 0; d < dim; d++) centroid[d] += e[d];
    }
    if (memberIdxs.length) for (let d = 0; d < dim; d++) centroid[d] /= memberIdxs.length;

    const avgCti =
      memberIdxs.reduce((s, i) => s + (field.units[i].cti ?? 0), 0) / (memberIdxs.length || 1);

    return {
      cluster_id: c.id,
      label: c.label,
      description: c.description,
      unit_count: c.unitCount,
      avg_fz: c.avgFZ,
      avg_fy: c.avgFY,
      avg_cti: avgCti,
      centroid_embedding: centroid,
    };
  });

  const { error: persistErr } = await supabase.functions.invoke("persist-field", {
    body: {
      filename: file.name,
      source_type: sourceType,
      embedding_model: "openai/text-embedding-3-small",
      embedding_dim: dim,
      stats: field.stats,
      chunks: chunkPayload,
      clusters: clusterPayload,
    },
  });
  if (persistErr) throw persistErr;

  console.info(`[persist] ${file.name} → vector DB (${chunkPayload.length} chunks)`);
}
