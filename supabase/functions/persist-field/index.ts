// Persist a Geometric Field into the searchable vector DB.
// Writes: documents, chunks (with embeddings + content_hash dedup), clusters_summary.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

interface ChunkPayload {
  chunk_index: number;
  text: string;
  content_hash: string;
  source_path?: string;
  cluster_id?: number;
  cluster_label?: string;
  fz?: number;
  fy?: number;
  cti?: number;
  triangulation?: unknown;
  intention?: unknown;
  embedding: number[];
}

interface ClusterPayload {
  cluster_id: number;
  label: string;
  description?: string;
  unit_count: number;
  avg_fz?: number;
  avg_fy?: number;
  avg_cti?: number;
  centroid_embedding: number[];
}

interface PersistPayload {
  filename: string;
  source_type: string;
  embedding_model?: string;
  embedding_dim?: number;
  stats?: Record<string, unknown>;
  chunks: ChunkPayload[];
  clusters: ClusterPayload[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const payload = (await req.json()) as PersistPayload;
    if (!payload.filename) throw new Error("filename required");
    if (!Array.isArray(payload.chunks)) throw new Error("chunks[] required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Insert document
    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .insert({
        filename: payload.filename,
        source_type: payload.source_type,
        embedding_model: payload.embedding_model ?? "openai/text-embedding-3-small",
        embedding_dim: payload.embedding_dim ?? 1536,
        stats: payload.stats ?? {},
      })
      .select("id")
      .single();
    if (docErr) throw docErr;

    const documentId = doc.id;

    // 2. Upsert chunks (dedup via UNIQUE (document_id, content_hash))
    const chunkRows = payload.chunks.map((c) => ({
      document_id: documentId,
      chunk_index: c.chunk_index,
      text: c.text,
      content_hash: c.content_hash,
      source_path: c.source_path,
      cluster_id: c.cluster_id,
      cluster_label: c.cluster_label,
      fz: c.fz,
      fy: c.fy,
      cti: c.cti,
      triangulation: c.triangulation,
      intention: c.intention,
      embedding: c.embedding,
      embedding_dim: payload.embedding_dim ?? 1536,
    }));

    // Chunked inserts to keep payloads reasonable
    const CHUNK_BATCH = 200;
    for (let i = 0; i < chunkRows.length; i += CHUNK_BATCH) {
      const slice = chunkRows.slice(i, i + CHUNK_BATCH);
      const { error: cErr } = await supabase
        .from("chunks")
        .upsert(slice, { onConflict: "document_id,content_hash", ignoreDuplicates: true });
      if (cErr) throw cErr;
    }

    // 3. Cluster summaries
    if (payload.clusters?.length) {
      const clusterRows = payload.clusters.map((c) => ({
        document_id: documentId,
        cluster_id: c.cluster_id,
        label: c.label,
        description: c.description,
        unit_count: c.unit_count,
        avg_fz: c.avg_fz,
        avg_fy: c.avg_fy,
        avg_cti: c.avg_cti,
        centroid_embedding: c.centroid_embedding,
        embedding_dim: payload.embedding_dim ?? 1536,
      }));
      const { error: clErr } = await supabase
        .from("clusters_summary")
        .upsert(clusterRows, { onConflict: "document_id,cluster_id" });
      if (clErr) throw clErr;
    }

    return new Response(JSON.stringify({ document_id: documentId, persisted_chunks: chunkRows.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
