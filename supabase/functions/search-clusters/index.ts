// Hybrid friction-cluster similarity.
// Auth: requires JWT; the source document must belong to the caller, and
// returned matches are filtered to clusters from the caller's own documents.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { requireUser } from "../_shared/auth.ts";

interface Body {
  document_id: string;
  cluster_id: number;
  fz_fy_weight?: number;
  min_similarity?: number;
  match_count?: number;
  exclude_self_doc?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;
  const userId = auth.userId;

  try {
    const body = (await req.json()) as Body;
    if (!body.document_id || typeof body.cluster_id !== "number") {
      return new Response(JSON.stringify({ error: "document_id and cluster_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Verify caller owns the source document
    const { data: srcDoc } = await supabase
      .from("documents")
      .select("user_id")
      .eq("id", body.document_id)
      .maybeSingle();
    if (!srcDoc || srcDoc.user_id !== userId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: source, error: srcErr } = await supabase
      .from("clusters_summary")
      .select("centroid_embedding, avg_fz, avg_fy, label, custom_label")
      .eq("document_id", body.document_id)
      .eq("cluster_id", body.cluster_id)
      .maybeSingle();

    if (srcErr) throw srcErr;
    if (!source?.centroid_embedding) {
      return new Response(JSON.stringify({ matches: [], source: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const requested = body.match_count ?? 10;
    const { data: matches, error: matchErr } = await supabase.rpc("match_clusters_hybrid", {
      query_embedding: source.centroid_embedding,
      query_fz: source.avg_fz ?? 0,
      query_fy: source.avg_fy ?? 0,
      match_count: requested * 4,
      exclude_doc_id: body.exclude_self_doc === false ? null : body.document_id,
      min_similarity: body.min_similarity ?? 0.0,
      fz_fy_weight: body.fz_fy_weight ?? 0.3,
    });

    if (matchErr) throw matchErr;

    // Restrict matches to caller-owned documents
    const { data: userDocs } = await supabase
      .from("documents")
      .select("id")
      .eq("user_id", userId);
    const ownedIds = new Set((userDocs ?? []).map((d: any) => d.id));
    const filtered = (matches ?? [])
      .filter((m: any) => ownedIds.has(m.document_id))
      .slice(0, requested);

    return new Response(JSON.stringify({
      source: {
        label: source.custom_label ?? source.label,
        avg_fz: source.avg_fz,
        avg_fy: source.avg_fy,
      },
      matches: filtered,
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
