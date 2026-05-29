// Hybrid friction-cluster similarity. Pulls the centroid + FZ/FY of a source
// cluster and asks Postgres to rank similar clusters across the corpus.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

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

    const { data: matches, error: matchErr } = await supabase.rpc("match_clusters_hybrid", {
      query_embedding: source.centroid_embedding,
      query_fz: source.avg_fz ?? 0,
      query_fy: source.avg_fy ?? 0,
      match_count: body.match_count ?? 10,
      exclude_doc_id: body.exclude_self_doc === false ? null : body.document_id,
      min_similarity: body.min_similarity ?? 0.0,
      fz_fy_weight: body.fz_fy_weight ?? 0.3,
    });

    if (matchErr) throw matchErr;

    return new Response(JSON.stringify({
      source: {
        label: source.custom_label ?? source.label,
        avg_fz: source.avg_fz,
        avg_fy: source.avg_fy,
      },
      matches: matches ?? [],
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
