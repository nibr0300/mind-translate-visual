import { supabase } from "@/integrations/supabase/client";
import type { RawTextUnit } from "../chunker";

/**
 * Audio adapter: transcribe via Lovable AI Gemini (server-side), then
 * timestamp-aware chunking. Each [HH:MM:SS]-prefixed segment becomes
 * its own RawTextUnit so the chunker can window them properly.
 */
export async function extractFromAudio(file: File): Promise<RawTextUnit[]> {
  const base64 = await fileToBase64(file);

  const { data, error } = await supabase.functions.invoke("transcribe-audio", {
    body: { audioBase64: base64, mimeType: file.type || "audio/mpeg", filename: file.name },
  });
  if (error) throw error;

  const transcript = (data as { transcript?: string })?.transcript ?? "";
  if (!transcript) return [];

  // Split on timestamp markers like [00:00:00] or [00:00] if present
  const timestampRegex = /\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g;
  const segments: { ts?: string; text: string }[] = [];
  let lastIdx = 0;
  let lastTs: string | undefined;
  let m: RegExpExecArray | null;

  while ((m = timestampRegex.exec(transcript))) {
    if (m.index > lastIdx) {
      const text = transcript.slice(lastIdx, m.index).trim();
      if (text) segments.push({ ts: lastTs, text });
    }
    lastTs = m[1];
    lastIdx = m.index + m[0].length;
  }
  const tail = transcript.slice(lastIdx).trim();
  if (tail) segments.push({ ts: lastTs, text: tail });

  if (segments.length === 0) {
    // No timestamps — sentence-window the entire transcript via chunker downstream
    return [{ text: transcript, source: file.name, position: 0 }];
  }

  return segments.map((s, i) => ({
    text: s.text,
    source: s.ts ? `${file.name}@${s.ts}` : file.name,
    position: i,
  }));
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
