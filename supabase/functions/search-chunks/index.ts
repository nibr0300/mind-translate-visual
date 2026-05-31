// Free-text semantic search across all stored chunks.
// Embeds the query, then ranks chunks via match_chunks() with an optional CTI floor.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

interface Body {
  query: string;
  min_cti?: number;
  min_similarity?: number;
  match_count?: number;
}

const EMBED_MODEL = "google/gemini-embedding-001";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

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

    const { data: matches, error } = await supabase.rpc("match_chunks", {
      query_embedding: queryEmbedding,
      match_count: body.match_count ?? 12,
      min_similarity: body.min_similarity ?? 0.3,
      min_cti: body.min_cti ?? 0.0,
    });
    if (error) throw error;

    // Join filenames in one extra query
    const docIds = Array.from(new Set((matches ?? []).map((m: any) => m.document_id)));
    let docMap = new Map<string, string>();
    if (docIds.length) {
      const { data: docs } = await supabase
        .from("documents")
        .select("id, filename")
        .in("id", docIds);
      docMap = new Map((docs ?? []).map((d: any) => [d.id, d.filename]));
    }

    const enriched = (matches ?? []).map((m: any) => ({
      ...m,
      filename: docMap.get(m.document_id) ?? null,
    }));

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
