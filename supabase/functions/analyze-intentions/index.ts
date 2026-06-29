import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireUser } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  try {
    const { textUnits } = await req.json();

    if (!Array.isArray(textUnits) || textUnits.length === 0) {
      return new Response(
        JSON.stringify({ error: "textUnits must be a non-empty array of strings" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Batch text units into chunks of 20 to stay within token limits
    const BATCH_SIZE = 20;
    const allResults: any[] = [];

    for (let i = 0; i < textUnits.length; i += BATCH_SIZE) {
      const batch = textUnits.slice(i, i + BATCH_SIZE);
      const numberedUnits = batch.map((t: string, idx: number) => `[${i + idx}] ${t}`).join("\n");

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            {
              role: "system",
              content: `You are a multilingual relational-field analyst. Text units may be in ANY language (commonly Swedish, English, or mixed). Analyze directly in the source language — do NOT translate. Treat each unit as a point in a tension field; do not flatten metaphor, lyric, or narrative voice into neutral description.

For each numbered unit, return:

1. **speechAct** — assertive | directive | commissive | expressive | declarative
2. **epistemicCertainty** (0.0 speculative ↔ 1.0 definitive)
3. **intentionalForce** (0.0 neutral/descriptive ↔ 1.0 strongly persuasive/transformative)
4. **truthTension** (0.0 settled ↔ 1.0 actively questioning/challenging an accepted frame)
5. **moralTension** (0.0 morally neutral ↔ 1.0 high friction: cowardice, denial, blame-shifting, self-exoneration, religious or ideological absolution of harm, complicity dressed as innocence, shame/guilt being deflected)
6. **narrativeTension** (0.0 no inter-subject friction ↔ 1.0 strong conflict between characters/voices/positions: betrayal, abandonment, accusation, unresolved harm, silenced witness)
7. **denialMarker** (0.0 owns reality ↔ 1.0 actively refuses or rewrites what is plainly the case)

Lyrics, prose, and dialogue can score high on moral/narrative tension even when the speech act is "expressive" and the hedging is zero — that is exactly the friction we are hunting. A line that piously absolves a perpetrator, blames the victim, or invokes fate/God to avoid responsibility is HIGH moralTension even if it sounds calm. A line where one character is wrongly accused, or where a voice silences another, is HIGH narrativeTension. Do not score moralTension on the mere presence of religious or dark vocabulary — score it on the *function* of the line in the field. Respond ONLY with the tool call.`,
            },
            {
              role: "user",
              content: `Analyze these text units:\n\n${numberedUnits}`,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "return_analysis",
                description: "Return intention analysis for text units",
                parameters: {
                  type: "object",
                  properties: {
                    analyses: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          index: { type: "number" },
                          speechAct: {
                            type: "string",
                            enum: ["assertive", "directive", "commissive", "expressive", "declarative"],
                          },
                          epistemicCertainty: { type: "number", description: "0.0-1.0" },
                          intentionalForce: { type: "number", description: "0.0-1.0" },
                          truthTension: { type: "number", description: "0.0-1.0" },
                        },
                        required: ["index", "speechAct", "epistemicCertainty", "intentionalForce", "truthTension"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["analyses"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "return_analysis" } },
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          return new Response(
            JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (response.status === 402) {
          return new Response(
            JSON.stringify({ error: "AI credits exhausted. Add funds in Settings → Workspace → Usage." }),
            { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const errText = await response.text();
        console.error("AI gateway error:", response.status, errText);
        throw new Error(`AI gateway returned ${response.status}`);
      }

      const data = await response.json();
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        const parsed = JSON.parse(toolCall.function.arguments);
        allResults.push(...(parsed.analyses || []));
      }
    }

    return new Response(JSON.stringify({ analyses: allResults }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-intentions error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
