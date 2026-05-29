import type { RawTextUnit } from "../chunker";
import { extractFromPdf } from "./pdfAdapter";
import { extractFromText } from "./textAdapter";
import { extractFromScript } from "./scriptAdapter";
import { extractFromImage } from "./imageAdapter";
import { extractFromAudio } from "./audioAdapter";
import { extractFromZip } from "./zipAdapter";
import { extractFromNotebook } from "./notebookAdapter";

export type SourceType = "pdf" | "text" | "script" | "image" | "audio" | "zip" | "json" | "notebook";

export function detectSourceType(file: File): SourceType {
  const name = file.name.toLowerCase();
  const mime = file.type.toLowerCase();

  if (mime === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (mime.startsWith("audio/") || /\.(mp3|wav|m4a|ogg|flac|webm)$/i.test(name)) return "audio";
  if (mime.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp)$/i.test(name)) return "image";
  if (mime === "application/zip" || name.endsWith(".zip")) return "zip";
  if (name.endsWith(".ipynb")) return "notebook";
  if (/\.(js|jsx|ts|tsx|py|rb|go|rs|java|kt|swift|c|cc|cpp|h|hpp|cs|php|sh|bash|zsh|sql|r|lua)$/i.test(name)) return "script";
  if (/\.json$/i.test(name)) return "json";
  return "text";
}

export async function extractFromFile(file: File): Promise<{ units: RawTextUnit[]; sourceType: SourceType }> {
  const sourceType = detectSourceType(file);

  switch (sourceType) {
    case "pdf":     return { units: await extractFromPdf(file), sourceType };
    case "audio":   return { units: await extractFromAudio(file), sourceType };
    case "image":   return { units: await extractFromImage(file), sourceType };
    case "zip":     return { units: await extractFromZip(file), sourceType };
    case "script":  return { units: await extractFromScript(file), sourceType };
    case "notebook":return { units: await extractFromNotebook(file), sourceType };
    case "json":
    case "text":    return { units: await extractFromText(file), sourceType };
  }
}

export type { RawTextUnit };
