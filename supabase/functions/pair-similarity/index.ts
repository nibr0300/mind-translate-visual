// Meaning similarity for cross-corpus DPO pairs. Embeds the given texts once
// and returns only one cosine per requested pair — vectors never reach the
// browser (they are ~3k floats each and would exhaust phone memory).
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { requireUser } from "../_shared/auth.ts";

const MODEL = "google/gemini-embedding-2";
const MAX_TEXTS = 400;
const MAX_PAIRS = 20_000;
const MAX_CHARS = 4_000;
const BATCH = 50;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? Math.round((dot / Math.sqrt(na * nb)) * 1000) / 1000 : 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  try {
    const { texts, pairs } = (await req.json()) as { texts?: unknown; pairs?: unknown };
    if (!Array.isArray(texts) || !texts.every((t) => typeof t === "string" && t.trim())) return json({ error: "texts[] required" }, 400);
    if (!Array.isArray(pairs)) return json({ error: "pairs[] required" }, 400);
    if (texts.length > MAX_TEXTS || pairs.length > MAX_PAIRS) return json({ error: `Max ${MAX_TEXTS} texts and ${MAX_PAIRS} pairs per request` }, 400);
    const valid = pairs.every((p) => Array.isArray(p) && p.length === 2 && p.every((i) => Number.isInteger(i) && i >= 0 && i < texts.length));
    if (!valid) return json({ error: "pairs must be [index, index] into texts" }, 400);

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "AI service is not configured" }, 500);

    const vectors: number[][] = new Array(texts.length);
    for (let i = 0; i < texts.length; i += BATCH) {
      const input = (texts as string[]).slice(i, i + BATCH).map((t) => t.slice(0, MAX_CHARS));
      let res: Response | null = null;
      let detail = "";
      for (let attempt = 0; attempt < 4; attempt++) {
        res = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model: MODEL, input }),
        });
        if (res.ok) break;
        detail = await res.text();
        if (res.status !== 429 && res.status < 500) break;
        await new Promise((r) => setTimeout(r, Math.min(8000, 1000 * 2 ** attempt) + Math.floor(Math.random() * 400)));
      }
      if (!res?.ok) {
        const status = res?.status ?? 500;
        let message = detail;
        try { message = JSON.parse(detail)?.error?.message ?? JSON.parse(detail)?.message ?? detail; } catch { /* raw text */ }
        if (status === 402) return json({ error: message || "AI credits are exhausted.", code: "credits" }, 402);
        return json({ error: `Meaning comparison failed (${status}): ${String(message).slice(0, 300)}` }, status === 429 ? 429 : status >= 500 ? 503 : status);
      }
      const data = await res.json();
      for (const v of (data.data ?? []) as { embedding: number[]; index: number }[]) vectors[i + v.index] = v.embedding;
    }
    if (vectors.some((v) => !Array.isArray(v))) return json({ error: "Meaning comparison returned incomplete results" }, 502);

    const scores = (pairs as [number, number][]).map(([a, b]) => cosine(vectors[a], vectors[b]));
    return json({ scores, model: MODEL });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});
