// Audio transcription via Lovable AI (Gemini multimodal).
// Asks model for timestamped output so audioAdapter can chunk by time.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { audioBase64, mimeType } = await req.json();
    if (!audioBase64) throw new Error("audioBase64 required");

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  "Transcribe this audio verbatim. Prefix each new paragraph or speaker turn with a [MM:SS] or [HH:MM:SS] timestamp. Detect language automatically. Output only the transcript, no commentary.",
              },
              {
                type: "input_audio",
                input_audio: { data: audioBase64, format: (mimeType ?? "audio/mpeg").replace(/^audio\//, "") },
              },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return new Response(JSON.stringify({ transcript: "", error: errText }), {
        status: res.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await res.json();
    const transcript = data.choices?.[0]?.message?.content ?? "";

    return new Response(JSON.stringify({ transcript }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ transcript: "", error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
