// Build a corpus topology AI-konsumerbar: cluster-noder med centroid_embedding,
// kvalitetsmetrik (cohesion/separation/noise), edges (cosine + FZ/FY-deltas),
// cross-document grupper, och valfritt alla chunks med embeddings.
//
// Body params:
//   min_similarity?: number  (edge threshold, default 0.55)
//   max_edges?:      number  (default 500)
//   include_chunks?: boolean (default false) — chunk-level embeddings + metrik
//   include_embeddings?: boolean (default false) — include vector arrays in nodes/chunks
//   noise_threshold?: number (default 0.5)  — sim-tröskel för noise_ratio
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

interface Body {
  min_similarity?: number;
  max_edges?: number;
  include_chunks?: boolean;
  include_embeddings?: boolean;
  noise_threshold?: number;
  /** Service-role callers (e.g. MCP server) may pass the target user_id explicitly. */
  user_id?: string;
}

/** pgvector returnerar centroid_embedding som sträng "[0.1,0.2,...]". Parse till number[]. */
function parseVector(v: unknown): number[] | null {
  if (v == null) return null;
  if (Array.isArray(v)) return v as number[];
  if (typeof v === "string") {
    try {
      const trimmed = v.trim();
      if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        return JSON.parse(trimmed) as number[];
      }
    } catch { /* fallthrough */ }
  }
  return null;
}

function cosineSimilarity(a: number[] | null, b: number[] | null): number | null {
  if (!a || !b || a.length === 0 || a.length !== b.length) return null;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (!normA || !normB) return null;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const minSim   = body.min_similarity ?? 0.55;
    const maxEdges = body.max_edges      ?? 500;
    const includeChunks  = body.include_chunks  ?? false;
    const includeEmbeddings = body.include_embeddings ?? false;
    const noiseThreshold = body.noise_threshold ?? 0.5;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Identify caller. Accept either a user JWT (Authorization: Bearer <jwt>)
    // or a service-role token + explicit body.user_id (used by the MCP server).
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    let userId: string | null = null;
    if (token && token === serviceKey && body.user_id) {
      userId = body.user_id;
    } else if (token) {
      const { data: u } = await supabase.auth.getUser(token);
      userId = u.user?.id ?? null;
    }
    if (!userId) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1) Documents (owned by user)
    const { data: docs, error: dErr } = await supabase
      .from("documents")
      .select("id, filename, source_type, uploaded_at, embedding_model, embedding_dim, stats")
      .eq("user_id", userId);
    if (dErr) throw dErr;
    const userDocIds = new Set((docs ?? []).map((d: any) => d.id));

    if (userDocIds.size === 0) {
      return new Response(JSON.stringify({
        schema_version: "corpus-map/2.1",
        exportedAt: new Date().toISOString(),
        params: {
          min_similarity: minSim,
          max_edges: maxEdges,
          include_chunks: includeChunks,
          include_embeddings: includeEmbeddings,
          noise_threshold: noiseThreshold,
        },
        corpus_summary: {
          cluster_count: 0,
          avg_cohesion: null,
          avg_separation: null,
          avg_noise_ratio: null,
          edge_count: 0,
          cross_doc_group_count: 0,
        },
        documents: [],
        nodes: [],
        edges: [],
        cross_doc_clusters: [],
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2) Cluster nodes — fetched only for this user. Edge/quality metrics are
    // computed in-process to avoid corpus-wide DB vector joins that can timeout.
    const { data: rawNodes, error: nErr } = await supabase
      .from("clusters_summary")
      .select("id, document_id, cluster_id, label, custom_label, description, unit_count, avg_fz, avg_fy, avg_cti, centroid_embedding, embedding_dim")
      .in("document_id", Array.from(userDocIds));
    if (nErr) throw nErr;

    const vectors = new Map<string, number[] | null>();
    for (const n of rawNodes ?? []) vectors.set(n.id, parseVector((n as any).centroid_embedding));

    const edgeCandidates: any[] = [];
    const nearestDistance = new Map<string, number>();
    const sourceNodes = rawNodes ?? [];
    for (let i = 0; i < sourceNodes.length; i++) {
      for (let j = i + 1; j < sourceNodes.length; j++) {
        const a: any = sourceNodes[i];
        const b: any = sourceNodes[j];
        const sim = cosineSimilarity(vectors.get(a.id) ?? null, vectors.get(b.id) ?? null);
        if (sim == null) continue;
        const distance = 1 - sim;
        nearestDistance.set(a.id, Math.min(nearestDistance.get(a.id) ?? Number.POSITIVE_INFINITY, distance));
        nearestDistance.set(b.id, Math.min(nearestDistance.get(b.id) ?? Number.POSITIVE_INFINITY, distance));
        if (sim < minSim) continue;
        const fzDelta = Math.abs((a.avg_fz ?? 0) - (b.avg_fz ?? 0));
        const fyDelta = Math.abs((a.avg_fy ?? 0) - (b.avg_fy ?? 0));
        edgeCandidates.push({
          src_id: a.id,
          dst_id: b.id,
          src_doc: a.document_id,
          dst_doc: b.document_id,
          src_cluster: a.cluster_id,
          dst_cluster: b.cluster_id,
          src_label: a.custom_label ?? a.label,
          dst_label: b.custom_label ?? b.label,
          similarity: sim,
          fz_delta: fzDelta,
          fy_delta: fyDelta,
          hybrid: 0.7 * sim + 0.3 * (1 - Math.min(fzDelta + fyDelta, 1)),
        });
      }
    }
    const edges = edgeCandidates.sort((a, b) => b.hybrid - a.hybrid).slice(0, maxEdges);
    const qMap = new Map<string, any>(sourceNodes.map((n: any) => {
      const nearest = nearestDistance.get(n.id);
      return [n.id, {
        separation: typeof nearest === "number" && Number.isFinite(nearest) ? nearest : 1,
        member_count: n.unit_count ?? 0,
      }];
    }));

    // 5) Normalisera noder: parsa centroid till number[], lägg på kvalitet
    const nodes = (rawNodes ?? []).map((n: any) => {
      const q = qMap.get(n.id);
      return {
        id: n.id,
        document_id: n.document_id,
        cluster_id: n.cluster_id,
        label: n.label,
        custom_label: n.custom_label,
        description: n.description,
        unit_count: n.unit_count,
        avg_fz: n.avg_fz,
        avg_fy: n.avg_fy,
        avg_cti: n.avg_cti,
        embedding_dim: n.embedding_dim,
        ...(includeEmbeddings ? { centroid_embedding: parseVector(n.centroid_embedding) } : {}),
        quality: q ? {
          cohesion: q.cohesion,
          separation: q.separation,
          noise_ratio: q.noise_ratio,
          member_count: q.member_count,
        } : null,
      };
    });

    // 6) Cross-document grupper (samma logik som tidigare)
    const adj = new Map<string, Set<string>>();
    for (const e of edges ?? []) {
      if (e.src_doc === e.dst_doc) continue;
      if (!adj.has(e.src_id)) adj.set(e.src_id, new Set());
      if (!adj.has(e.dst_id)) adj.set(e.dst_id, new Set());
      adj.get(e.src_id)!.add(e.dst_id);
      adj.get(e.dst_id)!.add(e.src_id);
    }
    const seen = new Set<string>();
    const crossDoc: Array<{ ids: string[]; appears_in: string[]; avg_cti: number; label: string }> = [];
    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    for (const id of adj.keys()) {
      if (seen.has(id)) continue;
      const stack = [id];
      const group: string[] = [];
      while (stack.length) {
        const cur = stack.pop()!;
        if (seen.has(cur)) continue;
        seen.add(cur);
        group.push(cur);
        for (const nb of adj.get(cur) ?? []) if (!seen.has(nb)) stack.push(nb);
      }
      if (group.length < 2) continue;
      const ns = group.map((g) => nodeById.get(g)).filter(Boolean) as any[];
      const docIds = Array.from(new Set(ns.map((n) => n.document_id)));
      if (docIds.length < 2) continue;
      const avg_cti = ns.reduce((s, n) => s + (n.avg_cti ?? 0), 0) / ns.length;
      const label = (ns[0].custom_label ?? ns[0].label) as string;
      crossDoc.push({ ids: group, appears_in: docIds, avg_cti, label });
    }
    crossDoc.sort((a, b) => b.avg_cti - a.avg_cti);

    // 7) Corpus-nivå sammandrag
    const valid = nodes.filter((n) => n.quality);
    const corpusSummary = valid.length ? {
      cluster_count: nodes.length,
      avg_cohesion:   valid.reduce((s, n) => s + (n.quality!.cohesion   ?? 0), 0) / valid.length,
      avg_separation: valid.reduce((s, n) => s + (n.quality!.separation ?? 0), 0) / valid.length,
      avg_noise_ratio: valid.reduce((s, n) => s + (n.quality!.noise_ratio ?? 0), 0) / valid.length,
      edge_count: (edges ?? []).length,
      cross_doc_group_count: crossDoc.length,
    } : null;

    // 8) Chunks (valfritt). Streama i sidor om 1000 för att undvika 1000-radersgränsen.
    let chunks: any[] | undefined;
    if (includeChunks) {
      chunks = [];
      const pageSize = 1000;
      let from = 0;
      while (true) {
        const { data: page, error: cErr } = await supabase
          .from("chunks")
          .select("id, document_id, chunk_index, text, source_path, cluster_id, cluster_label, fz, fy, cti, triangulation, intention, embedding, embedding_dim")
          .in("document_id", Array.from(userDocIds))
          .order("document_id", { ascending: true })
          .order("chunk_index", { ascending: true })
          .range(from, from + pageSize - 1);
        if (cErr) throw cErr;
        if (!page || page.length === 0) break;
        for (const c of page) {
          const { embedding, ...rest } = c as any;
          chunks.push(includeEmbeddings ? { ...rest, embedding: parseVector(embedding) } : rest);
        }
        if (page.length < pageSize) break;
        from += pageSize;
      }
    }

    return new Response(JSON.stringify({
      schema_version: "corpus-map/2.1",
      exportedAt: new Date().toISOString(),
      params: {
        min_similarity: minSim,
        max_edges: maxEdges,
        include_chunks: includeChunks,
        include_embeddings: includeEmbeddings,
        noise_threshold: noiseThreshold,
      },
      corpus_summary: corpusSummary,
      documents: docs ?? [],
      nodes,
      edges: edges ?? [],
      cross_doc_clusters: crossDoc,
      ...(chunks !== undefined ? { chunks } : {}),
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
