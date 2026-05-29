import { extractTextFromPDF } from "../pdfFieldGenerator";
import type { RawTextUnit } from "../chunker";

/** Thin wrapper around the existing PDF extraction so all adapters share the RawTextUnit shape. */
export async function extractFromPdf(file: File): Promise<RawTextUnit[]> {
  const sentences = await extractTextFromPDF(file);
  return sentences.map((text, i) => ({ text, source: file.name, position: i }));
}
