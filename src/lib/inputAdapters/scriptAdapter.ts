import type { RawTextUnit } from "../chunker";

/**
 * Script files (.js/.ts/.py/.tsx/...).
 * AST-light: capture top-level comments, function/class declarations, and
 * string literals as separate units so embeddings can find functional intent.
 */
export async function extractFromScript(file: File): Promise<RawTextUnit[]> {
  const text = await file.text();
  const units: RawTextUnit[] = [];
  let pos = 0;

  // Block comments / docstrings
  const blockComments = text.match(/\/\*[\s\S]*?\*\/|"""[\s\S]*?"""|'''[\s\S]*?'''/g) ?? [];
  for (const c of blockComments) {
    const cleaned = c.replace(/^[\/\*"'\s]+|[\/\*"'\s]+$/g, "").trim();
    if (cleaned.length > 10) units.push({ text: cleaned, source: file.name, position: pos++ });
  }

  // Line comments grouped by adjacency
  const lineComments = text.match(/(?:^|\n)(?:\s*(?:\/\/|#)[^\n]*\n?)+/g) ?? [];
  for (const c of lineComments) {
    const cleaned = c.replace(/^\s*(?:\/\/|#)\s?/gm, "").trim();
    if (cleaned.length > 10) units.push({ text: cleaned, source: file.name, position: pos++ });
  }

  // Function / class signatures
  const sigs = text.match(/(?:function|class|def|const|interface|type)\s+[A-Za-z_$][\w$]*[^\n{(]*/g) ?? [];
  for (const s of sigs.slice(0, 200)) {
    units.push({ text: s.trim(), source: file.name, position: pos++ });
  }

  // Fallback: if nothing structural, embed the file as raw lines
  if (units.length === 0) {
    const lines = text.split(/\n+/).map((l) => l.trim()).filter((l) => l.length > 5);
    for (const l of lines.slice(0, 300)) {
      units.push({ text: l, source: file.name, position: pos++ });
    }
  }

  return units;
}
