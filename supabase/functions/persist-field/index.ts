// Persist a Geometric Field into the searchable vector DB.
// - Document-level dedup via content_hash (reuses existing doc when re-uploaded)
// - Chunks upsert (dedup via UNIQUE (document_id, content_hash))
// - Cluster centroids
// - Fires async LLM relabel + ranking refresh
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
  content_hash?: string;          // NEW: document-level fingerprint
  embedding_model?: string;
  embedding_dim?: number;
  stats?: Record<string, unknown>;
  chunks: ChunkPayload[];
  clusters: ClusterPayload[];
  share_to_global?: boolean;
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

    // Identify the calling user from the Authorization bearer token.
    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;
    if (authHeader) {
      const token = authHeader.replace(/^Bearer\s+/i, "");
      const { data: userData } = await supabase.auth.getUser(token);
      userId = userData.user?.id ?? null;
    }
    if (!userId) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Document-level dedup (scoped to this user)
    let documentId: string | null = null;
    let reused = false;

    if (payload.content_hash) {
      const { data: existing } = await supabase
        .from("documents")
        .select("id")
        .eq("content_hash", payload.content_hash)
        .eq("user_id", userId)
        .maybeSingle();
      if (existing?.id) {
        documentId = existing.id;
        reused = true;
      }
    }

    if (!documentId) {
      const { data: doc, error: docErr } = await supabase
        .from("documents")
        .insert({
          filename: payload.filename,
          source_type: payload.source_type,
          content_hash: payload.content_hash ?? null,
          embedding_model: payload.embedding_model ?? "google/gemini-embedding-001",
          embedding_dim: payload.embedding_dim ?? 3072,
          stats: payload.stats ?? {},
          user_id: userId,
        })
        .select("id")
        .single();
      if (docErr) throw docErr;
      documentId = doc.id;
    }

    if (reused) {
      // Skip re-writing chunks/clusters — content already persisted under this doc
      return new Response(JSON.stringify({
        document_id: documentId,
        persisted_chunks: 0,
        reused: true,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Upsert chunks (per-chunk dedup via UNIQUE (document_id, content_hash))
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
      embedding_dim: payload.embedding_dim ?? 3072,
    }));

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
      // Skip empty clusters — no more "ghost" placeholders in corpus map
      const meaningful = payload.clusters.filter((c) => (c.unit_count ?? 0) > 0);
      const clusterRows = meaningful.map((c) => ({
        document_id: documentId,
        cluster_id: c.cluster_id,
        label: c.label,
        description: c.description,
        unit_count: c.unit_count,
        avg_fz: c.avg_fz,
        avg_fy: c.avg_fy,
        avg_cti: c.avg_cti,
        centroid_embedding: c.centroid_embedding,
        embedding_dim: payload.embedding_dim ?? 3072,
      }));
      if (clusterRows.length) {
        const { error: clErr } = await supabase
          .from("clusters_summary")
          .upsert(clusterRows, { onConflict: "document_id,cluster_id" });
        if (clErr) throw clErr;
      }
    }

    // Fire-and-forget: refresh ranking view + LLM relabel
    supabase.rpc("refresh_document_cti_ranking").then(({ error }) => {
      if (error) console.warn("[persist-field] refresh view failed:", error.message);
    });

    supabase.functions
      .invoke("label-clusters", { body: { document_id: documentId } })
      .then(({ error }) => { if (error) console.warn("[persist-field] relabel failed:", error.message); });

    return new Response(JSON.stringify({
      document_id: documentId,
      persisted_chunks: chunkRows.length,
      reused: false,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
