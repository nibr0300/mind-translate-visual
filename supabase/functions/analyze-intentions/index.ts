import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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
              content: `You are a speech-act and epistemic analyst. For each numbered text unit, analyze:

1. **Speech act type** (assertive, directive, commissive, expressive, declarative)
2. **Epistemic certainty** (0.0 = highly uncertain/speculative, 1.0 = definitive/factual)
3. **Intentional force** (0.0 = neutral/descriptive, 1.0 = strong persuasive/transformative intent)
4. **Truth-seeking tension** (0.0 = settled/accepted, 1.0 = actively questioning/challenging)

Respond ONLY with the tool call. Analyze the actual semantic intent, not just surface words.`,
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
