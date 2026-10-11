// Intention analysis core, shared by analyze-intentions and field-api.
export class IntentionError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export interface DomainInput {
  guidance?: string;
  axes?: { key: string; label?: string; low?: string; high?: string }[];
}

// deno-lint-ignore no-explicit-any
export async function analyzeUnits(textUnits: string[], domain?: DomainInput | null): Promise<any[]> {
  // Optional domain profile: extra guidance + two 0-1 axes per unit.
  const axes: { key: string; label: string; low: string; high: string }[] =
    Array.isArray(domain?.axes)
      ? domain.axes
          .filter((a: any) => a && /^[a-z_]{1,32}$/.test(String(a.key)))
          .slice(0, 4)
          .map((a: any) => ({ key: String(a.key), label: String(a.label ?? a.key).slice(0, 60), low: String(a.low ?? "").slice(0, 60), high: String(a.high ?? "").slice(0, 60) }))
      : [];
  const guidance = typeof domain?.guidance === "string" ? domain.guidance.slice(0, 1000) : "";
  const domainPrompt = guidance || axes.length
    ? `\n\nDOMAIN PROFILE: ${guidance}\nAlso return **domainAxes**, scoring each unit 0.0-1.0 on: ${axes.map((a) => `${a.key} (${a.label}: 0 = ${a.low}, 1 = ${a.high})`).join("; ")}.\nScore in fine steps (e.g. 0.15, 0.4, 0.72), based only on what the unit itself says. If an axis does not apply to the unit at all (e.g. a methods paragraph says nothing about bluffing), return -1 for that axis instead of guessing a middle value.`
    : "";
  const domainAxesSchema = axes.length
    ? {
        domainAxes: {
          type: "object",
          properties: Object.fromEntries(axes.map((a) => [a.key, { type: "number", description: `0.0 ${a.low} - 1.0 ${a.high}; -1 if not applicable` }])),
          required: axes.map((a) => a.key),
          additionalProperties: false,
        },
      }
    : {};

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

Lyrics, prose, and dialogue can score high on moral/narrative tension even when the speech act is "expressive" and the hedging is zero — that is exactly the friction we are hunting. A line that piously absolves a perpetrator, blames the victim, or invokes fate/God to avoid responsibility is HIGH moralTension even if it sounds calm. A line where one character is wrongly accused, or where a voice silences another, is HIGH narrativeTension. Do not score moralTension on the mere presence of religious or dark vocabulary — score it on the *function* of the line in the field. Respond ONLY with the tool call.${domainPrompt}`,
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
                        moralTension: { type: "number", description: "0.0-1.0" },
                        narrativeTension: { type: "number", description: "0.0-1.0" },
                        denialMarker: { type: "number", description: "0.0-1.0" },
                        ...domainAxesSchema,
                      },
                      required: ["index", "speechAct", "epistemicCertainty", "intentionalForce", "truthTension", "moralTension", "narrativeTension", "denialMarker", ...(axes.length ? ["domainAxes"] : [])],
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
        throw new IntentionError(429, "Rate limit exceeded. Please try again shortly.");
      }
      if (response.status === 402) {
        throw new IntentionError(402, "AI credits exhausted. Add funds in Settings → Workspace → Usage.");
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

  // Drop "not applicable" (-1) axis scores so they never count as real values.
  for (const r of allResults) {
    if (r?.domainAxes && typeof r.domainAxes === "object") {
      const kept = Object.fromEntries(
        Object.entries(r.domainAxes).filter(([, v]) => typeof v === "number" && v >= 0 && v <= 1),
      );
      if (Object.keys(kept).length) r.domainAxes = kept; else delete r.domainAxes;
    }
  }
  return allResults;
}
