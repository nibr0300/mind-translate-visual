import Tesseract from "tesseract.js";
import { supabase } from "@/integrations/supabase/client";
import type { RawTextUnit } from "../chunker";

/**
 * Image adapter: OCR + vision caption, concatenated into a SINGLE unit
 * (avoids double-counting the same image in clustering).
 *
 * Format: "[OCR]: ... [CAPTION]: ..."
 */
export async function extractFromImage(file: File): Promise<RawTextUnit[]> {
  const [ocrText, caption] = await Promise.all([
    runOcr(file).catch(() => ""),
    runCaption(file).catch(() => ""),
  ]);

  const parts: string[] = [];
  if (ocrText.trim()) parts.push(`[OCR]: ${ocrText.trim()}`);
  if (caption.trim()) parts.push(`[CAPTION]: ${caption.trim()}`);
  if (parts.length === 0) parts.push(`[IMAGE]: ${file.name}`);

  return [{ text: parts.join(" "), source: file.name, position: 0 }];
}

async function runOcr(file: File): Promise<string> {
  const result = await Tesseract.recognize(file, "eng+swe");
  return result.data.text.replace(/\s+/g, " ").trim();
}

async function runCaption(file: File): Promise<string> {
  const base64 = await fileToBase64(file);
  const { data, error } = await supabase.functions.invoke("caption-image", {
    body: { imageBase64: base64, mimeType: file.type || "image/png" },
  });
  if (error) throw error;
  return (data as { caption?: string })?.caption ?? "";
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
