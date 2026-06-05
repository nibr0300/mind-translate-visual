// Batch-embed chunks via Lovable AI Gateway. Requires authenticated caller.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { requireUser } from "../_shared/auth.ts";

interface EmbedItem {
  text: string;
  docName?: string;
  clusterLabel?: string;
  speechAct?: string;
  certainty?: number;
}

const MAX_CHUNKS = 10_000;
const BATCH = 50;
const MODEL = "google/gemini-embedding-001";
const DIM = 3072;

function augment(item: EmbedItem): string {
  const parts: string[] = [];
  if (item.docName)      parts.push(`[doc: ${item.docName}]`);
  if (item.clusterLabel) parts.push(`[cluster: ${item.clusterLabel}]`);
  if (item.speechAct)    parts.push(`[act: ${item.speechAct}]`);
  if (typeof item.certainty === "number") parts.push(`[certainty: ${item.certainty.toFixed(2)}]`);
  parts.push(item.text);
  return parts.join(" ");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  try {
    const { items } = (await req.json()) as { items: EmbedItem[] };
    if (!Array.isArray(items)) throw new Error("items[] required");
    if (items.length > MAX_CHUNKS) {
      return new Response(
        JSON.stringify({ error: `Too many chunks: ${items.length} (max ${MAX_CHUNKS})` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const embeddings: number[][] = new Array(items.length);

    for (let i = 0; i < items.length; i += BATCH) {
      const batch = items.slice(i, i + BATCH);
      const input = batch.map(augment);

      let res: Response | null = null;
      let lastErr = "";
      const maxAttempts = 5;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        res = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
          },
          body: JSON.stringify({ model: MODEL, input }),
        });

        if (res.ok) break;

        lastErr = await res.text();
        if (res.status === 429 || res.status >= 500) {
          // Exponential backoff with jitter: ~1s, 2s, 4s, 8s, 16s
          const wait = Math.min(16000, 1000 * 2 ** attempt) + Math.floor(Math.random() * 500);
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
        break;
      }

      if (!res || !res.ok) {
        const status = res?.status ?? 500;
        const retryable = status === 429 || status >= 500;
        return new Response(
          JSON.stringify({
            error: `Embedding batch ${i / BATCH} failed after retries: ${lastErr}`,
            retryable,
          }),
          { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const data = await res.json();
      const vectors: { embedding: number[]; index: number }[] = data.data ?? [];
      for (const v of vectors) embeddings[i + v.index] = v.embedding;

      // Small pacing delay between batches to reduce rate-limit pressure
      if (i + BATCH < items.length) {
        await new Promise((r) => setTimeout(r, 250));
      }
    }


    return new Response(JSON.stringify({ embeddings, model: MODEL, dim: DIM }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
