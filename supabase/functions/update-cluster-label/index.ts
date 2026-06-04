// PATCH: update a clusters_summary.custom_label. Owner-only.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { requireUser } from "../_shared/auth.ts";

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

  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;
  const userId = auth.userId;

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

    // Verify caller owns the target document
    const { data: doc } = await supabase
      .from("documents")
      .select("user_id")
      .eq("id", body.document_id)
      .maybeSingle();
    if (!doc || doc.user_id !== userId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
