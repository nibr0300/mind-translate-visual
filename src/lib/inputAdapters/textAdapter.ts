import type { RawTextUnit } from "../chunker";

/** Plain text, markdown, csv — split by paragraph. */
export async function extractFromText(file: File): Promise<RawTextUnit[]> {
  const text = await file.text();
  const paragraphs = text
    .split(/\n\s*\n+/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length >= 3);

  return paragraphs.map((p, i) => ({ text: p, source: file.name, position: i }));
}
