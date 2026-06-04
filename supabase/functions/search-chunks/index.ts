// Free-text semantic search across the caller's stored chunks.
// Embeds the query, ranks chunks via match_chunks(), then filters to caller-owned documents.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { requireUser } from "../_shared/auth.ts";

interface Body {
  query: string;
  min_cti?: number;
  min_similarity?: number;
  match_count?: number;
}

const EMBED_MODEL = "google/gemini-embedding-001";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;
  const userId = auth.userId;

  try {
    const body = (await req.json()) as Body;
    const query = (body.query ?? "").trim();
    if (!query) {
      return new Response(JSON.stringify({ matches: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const embedRes = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({ model: EMBED_MODEL, input: query }),
    });
    if (!embedRes.ok) {
      const txt = await embedRes.text();
      throw new Error(`Embedding failed: ${txt}`);
    }
    const embedData = await embedRes.json();
    const queryEmbedding = embedData?.data?.[0]?.embedding as number[] | undefined;
    if (!queryEmbedding) throw new Error("No embedding returned");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch caller's documents first; restrict search to those.
    const { data: userDocs, error: docsErr } = await supabase
      .from("documents")
      .select("id, filename")
      .eq("user_id", userId);
    if (docsErr) throw docsErr;
    const userDocIds = new Set((userDocs ?? []).map((d: any) => d.id));
    if (userDocIds.size === 0) {
      return new Response(JSON.stringify({ matches: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: matches, error } = await supabase.rpc("match_chunks", {
      query_embedding: queryEmbedding,
      match_count: (body.match_count ?? 12) * 4, // overshoot so post-filter has room
      min_similarity: body.min_similarity ?? 0.3,
      min_cti: body.min_cti ?? 0.0,
    });
    if (error) throw error;

    const docMap = new Map((userDocs ?? []).map((d: any) => [d.id, d.filename]));
    const enriched = (matches ?? [])
      .filter((m: any) => userDocIds.has(m.document_id))
      .slice(0, body.match_count ?? 12)
      .map((m: any) => ({ ...m, filename: docMap.get(m.document_id) ?? null }));

    return new Response(JSON.stringify({ matches: enriched }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
