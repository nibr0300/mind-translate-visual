// Build a corpus topology: cluster nodes + edges (cosine similarity, FZ/FY deltas).
// Replaces the old "flat inventory" export with an actual relational map.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

interface Body {
  min_similarity?: number;
  max_edges?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = (await req.json().catch(() => ({}))) as Body;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: docs, error: dErr } = await supabase
      .from("documents")
      .select("id, filename, source_type, uploaded_at");
    if (dErr) throw dErr;

    const { data: nodes, error: nErr } = await supabase
      .from("clusters_summary")
      .select("id, document_id, cluster_id, label, custom_label, description, unit_count, avg_fz, avg_fy, avg_cti");
    if (nErr) throw nErr;

    const { data: edges, error: eErr } = await supabase.rpc("corpus_cluster_edges", {
      min_similarity: body.min_similarity ?? 0.55,
      max_edges: body.max_edges ?? 500,
    });
    if (eErr) throw eErr;

    // Cross-document cluster groups: nodes whose hybrid edge ties them across docs
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
    const nodeById = new Map((nodes ?? []).map((n) => [n.id, n]));
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
      const docs = Array.from(new Set(ns.map((n) => n.document_id)));
      if (docs.length < 2) continue;
      const avg_cti = ns.reduce((s, n) => s + (n.avg_cti ?? 0), 0) / ns.length;
      const label = (ns[0].custom_label ?? ns[0].label) as string;
      crossDoc.push({ ids: group, appears_in: docs, avg_cti, label });
    }
    crossDoc.sort((a, b) => b.avg_cti - a.avg_cti);

    return new Response(JSON.stringify({
      exportedAt: new Date().toISOString(),
      documents: docs ?? [],
      nodes: nodes ?? [],
      edges: edges ?? [],
      cross_doc_clusters: crossDoc,
      params: { min_similarity: body.min_similarity ?? 0.55, max_edges: body.max_edges ?? 500 },
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
