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
  embedding?: number[];
}

interface ClusterPayload {
  cluster_id: number;
  label: string;
  description?: string;
  unit_count: number;
  avg_fz?: number;
  avg_fy?: number;
  avg_cti?: number;
  centroid_embedding?: number[];
}

interface PersistPayload {
  filename: string;
  source_type: string;
  content_hash?: string;          // NEW: document-level fingerprint
  file_size?: number;             // NEW: used with filename to replace re-uploads
  embedding_model?: string;
  embedding_dim?: number;
  stats?: Record<string, unknown>;
  chunks: ChunkPayload[];
  clusters: ClusterPayload[];
  share_to_global?: boolean;
}

const EMBEDDING_MODEL = "google/gemini-embedding-001";
const EMBEDDING_DIM = 3072;
const EMBEDDING_BATCH = 40;

function augmentForEmbedding(chunk: ChunkPayload, filename: string): string {
  const parts = [`[doc: ${filename}]`];
  if (chunk.cluster_label) parts.push(`[cluster: ${chunk.cluster_label}]`);
  const intention = chunk.intention as Record<string, unknown> | undefined;
  if (typeof intention?.speechAct === "string") parts.push(`[act: ${intention.speechAct}]`);
  if (typeof intention?.epistemicCertainty === "number") {
    parts.push(`[certainty: ${intention.epistemicCertainty.toFixed(2)}]`);
  }
  parts.push(chunk.text);
  return parts.join(" ");
}

async function createEmbeddings(chunks: ChunkPayload[], filename: string): Promise<number[][]> {
  if (chunks.every((chunk) => Array.isArray(chunk.embedding))) {
    return chunks.map((chunk) => chunk.embedding ?? []);
  }

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("AI embedding service is not configured");
  const embeddings: number[][] = new Array(chunks.length);

  for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH) {
    const input = chunks.slice(i, i + EMBEDDING_BATCH).map((chunk) => augmentForEmbedding(chunk, filename));
    const response = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input }),
    });
    if (!response.ok) throw new Error(`Embedding failed (${response.status}): ${await response.text()}`);
    const body = await response.json();
    const vectors = (body.data ?? []) as { embedding: number[]; index: number }[];
    for (const vector of vectors) embeddings[i + vector.index] = vector.embedding;
  }

  if (embeddings.some((embedding) => !Array.isArray(embedding))) {
    throw new Error("Embedding response was incomplete");
  }
  return embeddings;
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

    // 1. Document identity (scoped to this user)
    //    a) identical content  -> reuse as-is
    //    b) same filename (+size) -> REPLACE the old version instead of duplicating
    let documentId: string | null = null;
    let reused = false;
    let replaced = false;

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
      let q = supabase
        .from("documents")
        .select("id")
        .eq("user_id", userId)
        .eq("filename", payload.filename)
        .order("uploaded_at", { ascending: false });
      if (typeof payload.file_size === "number") {
        q = q.or(`file_size.eq.${payload.file_size},file_size.is.null`);
      }
      const { data: sameName } = await q;
      if (sameName?.length) {
        documentId = sameName[0].id;
        replaced = true;
        // Drop every older copy with the same name outright
        const stale = sameName.slice(1).map((d) => d.id);
        if (stale.length) await supabase.from("documents").delete().in("id", stale);
        // Wipe the previous version's content before rewriting
        await supabase.from("chunks").delete().eq("document_id", documentId);
        await supabase.from("clusters_summary").delete().eq("document_id", documentId);
        const { error: updErr } = await supabase
          .from("documents")
          .update({
            source_type: payload.source_type,
            content_hash: payload.content_hash ?? null,
            file_size: payload.file_size ?? null,
            embedding_model: payload.embedding_model ?? "google/gemini-embedding-001",
            embedding_dim: payload.embedding_dim ?? 3072,
            stats: payload.stats ?? {},
            uploaded_at: new Date().toISOString(),
            share_to_global: payload.share_to_global ?? false,
          })
          .eq("id", documentId);
        if (updErr) throw updErr;
      }
    }

    if (!documentId) {
      const { data: doc, error: docErr } = await supabase
        .from("documents")
        .insert({
          filename: payload.filename,
          source_type: payload.source_type,
          content_hash: payload.content_hash ?? null,
          file_size: payload.file_size ?? null,
          embedding_model: payload.embedding_model ?? "google/gemini-embedding-001",
          embedding_dim: payload.embedding_dim ?? 3072,
          stats: payload.stats ?? {},
          user_id: userId,
          share_to_global: payload.share_to_global ?? false,
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

    // Generate embeddings server-side. Returning them through the browser used
    // tens of megabytes of parsed JSON and caused mobile tabs to reload white.
    const embeddings = await createEmbeddings(payload.chunks, payload.filename);

    // Postgres text/jsonb cannot store \u0000. Strip null bytes everywhere.
    const stripNulls = (s: unknown): unknown => {
      if (typeof s === "string") return s.replace(/\u0000/g, "");
      if (Array.isArray(s)) return s.map(stripNulls);
      if (s && typeof s === "object") {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(s as Record<string, unknown>)) out[k] = stripNulls(v);
        return out;
      }
      return s;
    };
    const clean = (s?: string) => (typeof s === "string" ? s.replace(/\u0000/g, "") : s);

    // 2. Upsert chunks (per-chunk dedup via UNIQUE (document_id, content_hash))
    const chunkRows = payload.chunks.map((c, index) => ({
      document_id: documentId,
      chunk_index: c.chunk_index,
      text: clean(c.text),
      content_hash: c.content_hash,
      source_path: clean(c.source_path),
      cluster_id: c.cluster_id,
      cluster_label: clean(c.cluster_label),
      fz: c.fz,
      fy: c.fy,
      cti: c.cti,
      triangulation: stripNulls(c.triangulation),
      intention: stripNulls(c.intention),
      embedding: embeddings[index],
      embedding_dim: payload.embedding_dim ?? EMBEDDING_DIM,
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
      const clusterRows = meaningful.map((c) => {
        const memberIndexes = payload.chunks.flatMap((chunk, index) =>
          chunk.cluster_id === c.cluster_id ? [index] : []
        );
        const centroid = new Array(payload.embedding_dim ?? EMBEDDING_DIM).fill(0);
        for (const index of memberIndexes) {
          const embedding = embeddings[index];
          for (let dimension = 0; dimension < centroid.length; dimension++) {
            centroid[dimension] += embedding[dimension] ?? 0;
          }
        }
        if (memberIndexes.length) {
          for (let dimension = 0; dimension < centroid.length; dimension++) {
            centroid[dimension] /= memberIndexes.length;
          }
        }
        return {
          document_id: documentId,
          cluster_id: c.cluster_id,
          label: c.label,
          description: c.description,
          unit_count: c.unit_count,
          avg_fz: c.avg_fz,
          avg_fy: c.avg_fy,
          avg_cti: c.avg_cti,
          centroid_embedding: c.centroid_embedding ?? centroid,
          embedding_dim: payload.embedding_dim ?? EMBEDDING_DIM,
        };
      });
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
      replaced,
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
