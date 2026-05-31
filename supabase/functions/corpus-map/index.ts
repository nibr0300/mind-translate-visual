// Build a corpus topology AI-konsumerbar: cluster-noder med centroid_embedding,
// kvalitetsmetrik (cohesion/separation/noise), edges (cosine + FZ/FY-deltas),
// cross-document grupper, och valfritt alla chunks med embeddings.
//
// Body params:
//   min_similarity?: number  (edge threshold, default 0.55)
//   max_edges?:      number  (default 500)
//   include_chunks?: boolean (default true) — chunk-level embeddings + metrik
//   noise_threshold?: number (default 0.5)  — sim-tröskel för noise_ratio
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

interface Body {
  min_similarity?: number;
  max_edges?: number;
  include_chunks?: boolean;
  noise_threshold?: number;
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const minSim   = body.min_similarity ?? 0.55;
    const maxEdges = body.max_edges      ?? 500;
    const includeChunks  = body.include_chunks  ?? true;
    const noiseThreshold = body.noise_threshold ?? 0.5;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Identify caller (JWT) — corpus is scoped to that user only.
    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;
    if (authHeader) {
      const token = authHeader.replace(/^Bearer\s+/i, "");
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

    // 2) Cluster nodes — inkl. centroid_embedding för AI-konsumtion
    const { data: rawNodes, error: nErr } = await supabase
      .from("clusters_summary")
      .select("id, document_id, cluster_id, label, custom_label, description, unit_count, avg_fz, avg_fy, avg_cti, centroid_embedding, embedding_dim")
      .in("document_id", Array.from(userDocIds));
    if (nErr) throw nErr;

    // 3) Edges (hybrid score) — filter to user's clusters only
    const { data: rawEdges, error: eErr } = await supabase.rpc("corpus_cluster_edges", {
      min_similarity: minSim,
      max_edges: maxEdges,
    });
    if (eErr) throw eErr;
    const edges = (rawEdges ?? []).filter((e: any) => userDocIds.has(e.src_doc) && userDocIds.has(e.dst_doc));

    // 4) Kvalitetsmetrik per kluster (cohesion / separation / noise)
    const { data: rawQuality, error: qErr } = await supabase.rpc("corpus_cluster_quality", {
      noise_threshold: noiseThreshold,
    });
    if (qErr) throw qErr;
    const quality = (rawQuality ?? []).filter((q: any) => userDocIds.has(q.document_id));
    const qMap = new Map<string, any>((quality ?? []).map((q: any) => [q.cluster_summary_id, q]));

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
        centroid_embedding: parseVector(n.centroid_embedding),
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
          chunks.push({ ...c, embedding: parseVector(c.embedding) });
        }
        if (page.length < pageSize) break;
        from += pageSize;
      }
    }

    return new Response(JSON.stringify({
      schema_version: "corpus-map/2.0",
      exportedAt: new Date().toISOString(),
      params: {
        min_similarity: minSim,
        max_edges: maxEdges,
        include_chunks: includeChunks,
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
