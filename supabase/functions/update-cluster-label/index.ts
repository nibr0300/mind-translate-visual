// PATCH: update a clusters_summary.custom_label
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

interface Body {
  cluster_id: number;
  document_id: string;
  custom_label: string | null;
}

function sanitize(s: string): string {
  return s.replace(/<[^>]*>/g, "").trim().slice(0, 60);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = (await req.json()) as Body;
    if (typeof body.cluster_id !== "number" || !body.document_id) {
      return new Response(JSON.stringify({ error: "cluster_id and document_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cleanLabel = body.custom_label === null ? null : sanitize(String(body.custom_label));

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data, error } = await supabase
      .from("clusters_summary")
      .update({
        custom_label: cleanLabel,
        custom_label_updated_at: new Date().toISOString(),
      })
      .eq("cluster_id", body.cluster_id)
      .eq("document_id", body.document_id)
      .select("id, cluster_id, document_id, custom_label, custom_label_updated_at")
      .single();

    if (error) throw error;

    return new Response(JSON.stringify({ cluster: data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
