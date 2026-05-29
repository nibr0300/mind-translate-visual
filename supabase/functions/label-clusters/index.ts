// Re-label clusters with LLM-generated semantic labels + descriptions.
// Replaces token-frequency labels like "Path · Print · File" with meaningful
// labels derived from the actual content of representative chunks.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

interface Body {
  document_id: string;
  // optional: only re-label these cluster_ids
  cluster_ids?: number[];
  // max representative texts per cluster sent to LLM (default 6)
  samples_per_cluster?: number;
}

const MODEL = "google/gemini-2.5-flash";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = (await req.json()) as Body;
    if (!body.document_id) throw new Error("document_id required");

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Pull clusters (skip those already user-relabeled — custom_label wins)
    let cq = supabase
      .from("clusters_summary")
      .select("cluster_id, label, custom_label, unit_count, avg_fz, avg_cti")
      .eq("document_id", body.document_id);
    if (body.cluster_ids?.length) cq = cq.in("cluster_id", body.cluster_ids);
    const { data: clusters, error: cErr } = await cq;
    if (cErr) throw cErr;
    if (!clusters?.length) {
      return new Response(JSON.stringify({ updated: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const samples = body.samples_per_cluster ?? 6;
    const updates: { cluster_id: number; label: string; description: string }[] = [];

    for (const cl of clusters) {
      if (cl.custom_label) continue;                  // never overwrite user labels
      if ((cl.unit_count ?? 0) === 0) continue;       // skip empty placeholders

      // Sample highest-tension chunks first; they tend to be the most contentful
      const { data: chunks } = await supabase
        .from("chunks")
        .select("text, cti, fz")
        .eq("document_id", body.document_id)
        .eq("cluster_id", cl.cluster_id)
        .order("cti", { ascending: false, nullsFirst: false })
        .limit(samples);

      if (!chunks?.length) continue;
      const texts = chunks.map((c, i) => `(${i + 1}) ${c.text.slice(0, 400)}`).join("\n");

      const prompt = `You are labeling a thematic cluster from a semantic field analysis.
Below are ${chunks.length} representative passages from the cluster.

PASSAGES:
${texts}

Return STRICT JSON with this shape:
{"label": "<2-4 word semantic label, Title Case, no punctuation>", "description": "<one sentence (≤140 chars) describing the cluster's theme, register or function>"}

Avoid generic words like "Text", "Content", "Document", "Cluster". Prefer concrete topical or relational concepts. If the cluster looks like code or system prompt, name the operational role (e.g. "Operator Logic", "Ethical Guard", "Counter Loop").`;

      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: "You output strict JSON only. No prose, no markdown fences." },
            { role: "user", content: prompt },
          ],
          temperature: 0.4,
        }),
      });
      if (!res.ok) { console.warn("[label] LLM failed", await res.text()); continue; }
      const data = await res.json();
      const raw: string = data.choices?.[0]?.message?.content ?? "";
      const clean = raw.trim().replace(/^```(?:json)?/, "").replace(/```$/, "").trim();
      let parsed: { label?: string; description?: string } = {};
      try { parsed = JSON.parse(clean); } catch { continue; }
      if (!parsed.label) continue;

      updates.push({
        cluster_id: cl.cluster_id,
        label: parsed.label.slice(0, 80),
        description: (parsed.description ?? "").slice(0, 240),
      });
    }

    // Persist
    for (const u of updates) {
      const { error } = await supabase
        .from("clusters_summary")
        .update({ label: u.label, description: u.description })
        .eq("document_id", body.document_id)
        .eq("cluster_id", u.cluster_id);
      if (error) console.warn("[label] update failed", error.message);
    }

    return new Response(JSON.stringify({ updated: updates.length, labels: updates }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
