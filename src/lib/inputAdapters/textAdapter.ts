import type { RawTextUnit } from "../chunker";

/** Result of stripping markup from a raw text payload. */
export interface SanitizeResult {
  text: string;
  /** Fraction of the original characters that were markup (0..1). */
  markupRatio: number;
}

const ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  "#39": "'",
  "#160": " ",
};

/**
 * Strip HTML/CSS noise from a text payload.
 *
 * Saved Google Docs / Blink HTML leaks tokens like `quot`, `11pt`, `span`,
 * `0px` into the field, which then produce clusters and CTI values that have
 * nothing to do with the actual document. We remove those before chunking and
 * report how much of the payload was markup so the UI can warn about it.
 */
export function sanitizeMarkup(raw: string): SanitizeResult {
  const originalLen = raw.replace(/\s+/g, " ").trim().length;

  // Only treat as markup when the payload actually looks like HTML/CSS.
  const looksLikeMarkup = /<\/?[a-z][\w-]*(\s[^>]*)?>/i.test(raw) || /\{[^{}]*:[^{}]*;[^{}]*\}/.test(raw);
  if (!looksLikeMarkup) return { text: raw, markupRatio: 0 };

  let out = raw
    // Whole blocks whose content is never prose
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<head[\s\S]*?<\/head>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    // Block-level tags become paragraph breaks so structure survives
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article|blockquote)\s*>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    // Remaining tags
    .replace(/<\/?[a-z][\w-]*(\s[^>]*)?>/gi, " ")
    // Stray CSS rule bodies (e.g. leftover `.c1{font-size:11pt;margin:0px}`)
    .replace(/[.#]?[\w-]+\s*\{[^{}]*\}/g, " ")
    // Bare CSS declarations that survived tag stripping
    .replace(/\b[a-z-]+\s*:\s*[^;{}\n]{1,60};/gi, " ");

  out = out.replace(/&([a-z#0-9]+);/gi, (m, name) => ENTITIES[String(name).toLowerCase()] ?? " ");

  // Collapse whitespace but keep paragraph breaks
  out = out.replace(/[ \t\u00a0]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();

  const cleanLen = out.replace(/\s+/g, " ").length;
  const markupRatio = originalLen > 0 ? Math.max(0, 1 - cleanLen / originalLen) : 0;

  return { text: out, markupRatio };
}

/** Set by the last text extraction so the pipeline can surface a warning. */
export let lastMarkupRatio = 0;

/** Plain text, markdown, csv, html — split by paragraph after markup sanitization. */
export async function extractFromText(file: File): Promise<RawTextUnit[]> {
  const raw = await file.text();
  const { text, markupRatio } = sanitizeMarkup(raw);
  lastMarkupRatio = markupRatio;

  if (markupRatio > 0.3) {
    console.warn(
      `[textAdapter] ${file.name}: ${(markupRatio * 100).toFixed(0)}% of the payload was markup and was stripped.`
    );
  }

  const paragraphs = text
    .split(/\n\s*\n+/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length >= 3);

  return paragraphs.map((p, i) => ({ text: p, source: file.name, position: i }));
}
