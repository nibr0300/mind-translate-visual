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
import { lastMarkupRatio } from "./inputAdapters/textAdapter";
import { chunkUnits, type Chunk } from "./chunker";
import { sha256Hex } from "./contentHash";
import { generateFieldFromPDF } from "./pdfFieldGenerator";
import {
  computeTFIDF,
  kMeans,
  projectTo2D,
  generateClusterLabels,
  spreadCollisions,
  degenerateFlags,
  computeKnnEdges,
  edgeCentrality,
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
import { isCreditError, notifyCreditsExhausted } from "./creditNotice";


export type ProgressCb = (stage: string, value: number) => void;

export async function generateFieldFromFile(
  file: File,
  onProgress?: ProgressCb
): Promise<GeometricField> {
  const sourceType = detectSourceType(file);

  let field: GeometricField;
  let chunks: Chunk[];
  const notes: string[] = [];
  let totalFound = 0;

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
    const { units: rawUnits } = await extractFromFile(file, onProgress);

    if (rawUnits.length === 0) {
      throw new Error(`No text could be extracted from this ${sourceType} file.`);
    }

    onProgress?.("Chunking content…", 0.2);
    chunks = chunkUnits(rawUnits);
    totalFound = chunks.length;

    if (lastMarkupRatio > 0.3) {
      notes.push(
        `${Math.round(lastMarkupRatio * 100)}% of the source was HTML/CSS markup and was stripped before analysis.`
      );
    }

    if (chunks.length < 3) {
      throw new Error("Content too short to build a meaningful field (min 3 chunks).");
    }

    // Fair per-source cap: when a zip/album has many sources (e.g. 10 songs),
    // a naive slice(0, 200) drops every track after the first few. Instead,
    // distribute a larger budget proportionally across sources so every file
    // is represented in the field.
    const HARD_CAP = 600;
    if (chunks.length > HARD_CAP) {
      const bySource = new Map<string, Chunk[]>();
      for (const c of chunks) {
        const key = (c.source ?? "").split("@")[0] || "_";
        if (!bySource.has(key)) bySource.set(key, []);
        bySource.get(key)!.push(c);
      }
      const sources = [...bySource.values()];
      const perSource = Math.max(3, Math.floor(HARD_CAP / sources.length));
      const balanced: Chunk[] = [];
      for (const arr of sources) {
        if (arr.length <= perSource) {
          balanced.push(...arr);
        } else {
          // Evenly sample across the source so we keep beginning, middle, end
          const step = arr.length / perSource;
          for (let i = 0; i < perSource; i++) balanced.push(arr[Math.floor(i * step)]);
        }
      }
      console.info(`[field] balanced cap: ${chunks.length} → ${balanced.length} chunks across ${sources.length} sources`);
      chunks = balanced;
      notes.push(
        `Source capped: ${chunks.length} of ${totalFound} units analyzed (evenly sampled across ${sources.length} source${sources.length === 1 ? "" : "s"}).`
      );
    }

    field = await buildFieldFromChunks(chunks, sourceType, onProgress);
    field.stats.analyzedOf = { analyzed: chunks.length, total: totalFound };
    if (notes.length) field.stats.notes = [...(field.stats.notes ?? []), ...notes];
  }

  // Background: embed + persist. Don't block UI on it.
  void persistFieldInBackground(field, chunks, file, sourceType).catch((err) => {
    if (isCreditError(err)) notifyCreditsExhausted();
    else console.warn("[persist] failed:", err);
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
  const rawCoords = projectTo2D(vectors);
  const { coords: coords2D, uniqueBefore } = spreadCollisions(
    rawCoords,
    texts.map((t, i) => `u${i}:${t.slice(0, 24)}`)
  );
  const degenerate = degenerateFlags(vectors);
  const knnEdges = computeKnnEdges(vectors, 8);
  const { degree, weighted } = edgeCentrality(knnEdges, texts.length);
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
      clusterDeviation,
      intention ?? null
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
      sourcePath: chunks[i]?.source,
      ...(degenerate[i] ? { degenerate: true } : {}),
      degree: degree[i],
      weightedCentrality: weighted[i],
      ...(intention && {
        intention: {
          speechAct: intention.speechAct,
          epistemicCertainty: intention.epistemicCertainty,
          intentionalForce: intention.intentionalForce,
          truthTension: intention.truthTension,
          moralTension: intention.moralTension,
          narrativeTension: intention.narrativeTension,
          denialMarker: intention.denialMarker,
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

  const degenerateUnits = degenerate.filter(Boolean).length;
  const stats: GeometricField["stats"] = {
    totalUnits: units.length,
    boundaryUnits,
    avgFZ: units.reduce((s, u) => s + u.fz, 0) / units.length,
    avgFY: units.reduce((s, u) => s + u.fy, 0) / units.length,
    coordinateResolution: units.length ? Math.round((uniqueBefore / units.length) * 100) / 100 : 1,
    degenerateUnits,
  };
  if (degenerateUnits > 0) {
    stats.notes = [
      `${degenerateUnits} unit${degenerateUnits === 1 ? "" : "s"} had no distinctive terms — their position is fallback placement, not semantics.`,
    ];
  }

  return {
    units,
    clusters,
    edges: knnEdges.map((e) => ({
      source: units[e.source].id,
      target: units[e.target].id,
      similarity: e.similarity,
    })),
    stats,
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
  }));

  // Embeddings and cluster centroids are generated inside persist-field. Keeping
  // 600 × 3072 JSON numbers out of the browser prevents mobile tab reloads.
  const clusterPayload = field.clusters.map((c) => {
    const memberIdxs = field.units.flatMap((u, i) => (u.clusterId === c.id ? [i] : []));
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
    };
  });

  // Document-level content hash = hash of all chunk hashes, in stable order.
  // Detects byte-identical re-uploads (same content, possibly renamed file).
  const docHash = await sha256Hex(hashes.slice().sort().join("|"));

  const shareToGlobal = (() => {
    try { return localStorage.getItem("share_to_global_default") === "1"; } catch { return false; }
  })();

  const { data: persistData, error: persistErr } = await supabase.functions.invoke("persist-field", {
    body: {
      filename: file.name,
      source_type: sourceType,
      content_hash: docHash,
      file_size: file.size,
      embedding_model: "google/gemini-embedding-001",
      embedding_dim: 3072,
      stats: field.stats,
      chunks: chunkPayload,
      clusters: clusterPayload,
      share_to_global: shareToGlobal,
    },
  });
  if (persistErr) throw persistErr;

  const info = persistData as { reused?: boolean; persisted_chunks?: number };
  if (info?.reused) {
    console.info(`[persist] ${file.name} → reused existing document (dedup hit)`);
  } else {
    console.info(`[persist] ${file.name} → vector DB (${info?.persisted_chunks ?? chunkPayload.length} chunks)`);
  }
}
