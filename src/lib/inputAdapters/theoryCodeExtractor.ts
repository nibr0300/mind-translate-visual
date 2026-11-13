/**
 * Formal theory & code structural extraction (theory_code profile).
 *
 * A proof and a program are not prose. A definition, an axiom, a derivation
 * step, a formula block, a state mutation and a tool call each carry their own
 * signal and must become their own node — never diluted inside a paragraph,
 * never split mid-token.
 *
 * Deterministic: same input always yields the same units in the same order.
 */
import type { RawTextUnit } from "../chunker";
import {
  corpusHash,
  dedupeNearDuplicates,
  simHash,
  simHashSimilarity,
  type NoiseDrop,
} from "./securityExtractor";

export type TheoryUnitType =
  | "definition"
  | "axiom"
  | "derivation"
  | "claim"
  | "formula"
  | "code_def"
  | "code_mutation"
  | "code_call"
  | "prose";

export interface TheoryUnit {
  text: string;
  unitType: TheoryUnitType;
  /** Character offset in the normalized source text. */
  start: number;
  end: number;
}

export interface TheoryExtraction {
  units: TheoryUnit[];
  dropped: NoiseDrop[];
}

export type { NoiseDrop };
export { corpusHash, dedupeNearDuplicates, simHash, simHashSimilarity };

/* ------------------------------------------------------------------ *
 * Markers
 * ------------------------------------------------------------------ */

/** Lines that are declarations, not arguments. */
const CODE_DEF =
  /^\s*(?:export\s+|public\s+|private\s+|static\s+|async\s+)*(?:def|class|function|interface|struct|enum|type|trait|impl)\s+[A-Za-z_$][\w$]*|^\s*(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*(?:async\s*)?(?:\(|function\b|new\s)/;

/** Evidence that a line is executable code rather than mathematics. */
const CODE_EVIDENCE = /[{}();]|=>|\bself\.|\bdef\b|\breturn\b|state\[|effects\s*=|\bprint\(|\bawait\b/;

/** Assignment / state change: the operational heart of a program. */
const CODE_MUTATION =
  /^\s*(?:[A-Za-z_$][\w.$\[\]'"]*|self\.[\w.]+|state\[[^\]]+\])\s*(?:=|\+=|-=|\*=|\/=)(?!=)|\beffects\s*=|\.append\(|\.update\(|\.extend\(|\bset_\w+\(/;

/** A call that reaches outside the text: a tool, a file, a process, a network. */
const CODE_CALL =
  /\b(?:await|subprocess|requests|urllib|httpx|client|openai|os\.system|shutil|socket|fetch|axios)\b|\b[\w.]+\s*\(\s*(?:["'`][^"'`]{1,60}["'`]|\)|[A-Za-z_$][\w$=]*\s*[,)=])|=>\s*[\w.]+\(|\bexec\w*\(|\bexecute_\w+\(|\btool_call\b|\bread_\w+\(|\bwrite_\w+\(|\bsend_\w+\(|\bpost\w*\(|\bget_\w+\(/;

/** The act of naming something. */
const DEFINITION =
  /\b(?:definition|definiera|definierar|definierad|definieras|denotes|beteckna|betecknar|is defined as|defined as|kallas|där X är|vi skriver|vi kallar|låt oss kalla)\b|:=|\\triangleq|^\s*(?:def\.?|definition)\s*\d/i;

/** The act of assuming something. */
const AXIOM =
  /\b(?:vi antar|vi förutsätter|antar att|antagande|antaganden|axiom|postulat|vi postulerar|vi modellerar|vi tolkar|vi identifierar|per definition|by definition|vi säger att|om vi antar|assume|we assume|suppose|supposing|hypotes|gissningsvis|vi låtsas|förenklat|vi bortser från|detta kräver att)\b/i;

/** The act of asserting a result. */
const CLAIM =
  /\b(?:vi visar|vi bevisar|vi har visat|det kan visas|detta bevisar|bevisar att|därmed har vi|följden är|slutsatsen|vi hävdar|vi påstår|detta innebär|vi har uppnått|detta löser|detta ger oss|därmed är|sålunda|this proves|this shows|we have achieved|we demonstrate|it follows that|q\.e\.d|sats|theorem|lemma|korollarie|proposition|satsen)\b/i;

/** The act of moving from one line to the next — with or without showing work. */
const DERIVATION =
  /(?<![a-z0-9])(?:trivialt|trivially|lätt inses|lättvisat|easily|uppenbart|obvious|obviously|it is obvious|tydligen|utan vidare|hoppar över|därmed|hence|therefore|alltså|därför|följaktligen|följer|substituera|sätter vi in|steg för steg|mellanliggande|härledning|vi får|det ger|vilket ger|enligt ovan|se ekvation|analogt|av symmetri|by symmetry|one can show|easily seen|som framgår|omedelbart|detsamma gäller|utveckla|expandera|integrera|derivera)(?![a-z0-9])|⇒|⟹/i;

/** Standalone mathematics: display math or a line that is mostly symbols. */
const FORMULA_BLOCK =
  /\$\$[\s\S]+?\$\$|\\\[([\s\S]+?)\\\]|\\begin\{[a-zA-Z*]+\}[\s\S]*?\\end\{[a-zA-Z*]+\}/g;

const MATH_MARK = /[=<>≤≥∈∉⊂⊃∪∩∫∑√∞⊗⊕⊥⟂⟨⟩ΔΩΓΛΣΠλψφστωαβγδℏℓ∂∇≈≡≠∝⇔⇒→←↑↓±×÷∴∵]/;
const GREEK = /[αβγδεζηθικλμνξοπρστυφχψωΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩℏℓ]/g;

function mathRatio(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  let math = 0;
  for (const ch of t) if (MATH_MARK.test(ch) || /[0-9_\\^{}]/.test(ch)) math++;
  return math / t.length;
}

function isFormulaLine(t: string): boolean {
  if (!t.includes("=") && !/\\(frac|sum|int|langle|sqrt|partial|nabla)/.test(t)) return false;
  return mathRatio(t) >= 0.18 || (t.match(GREEK)?.length ?? 0) >= 2;
}

/* ------------------------------------------------------------------ *
 * Noise
 * ------------------------------------------------------------------ */

const NOISE_PATTERNS: { re: RegExp; reason: string }[] = [
  { re: /^\s*$/, reason: "empty" },
  { re: /^\d{1,4}$/, reason: "page number" },
  { re: /^\d{1,4}\s*\/\s*\d{1,4}$/, reason: "page number" },
  { re: /^(sidan|side|page)\s*\d{1,4}\b/i, reason: "page marker" },
  { re: /^[=\-*_·—–\s]{4,}$/, reason: "separator" },
  { re: /^[A-Za-z0-9+/=]{40,}$/, reason: "encoded blob" },
  { re: /^(fig|figure|fig\.|tabell|table|tab\.?)\s*\d{1,3}\s*[:.]?$/i, reason: "caption stub" },
  { re: /^(skip to (main )?content|powered by\b|learn more\.?|©|copyright)\s/i, reason: "boilerplate" },
  { re: /^(http|https):\/\/\S+$/, reason: "bare url" },
];

function isNoise(text: string): string | null {
  const t = text.trim();
  for (const { re, reason } of NOISE_PATTERNS) if (re.test(t)) return reason;
  if (t.length < 3) return "too short";
  if (!/[\p{L}\p{N}]/u.test(t)) return "no content";
  // A line that is almost entirely punctuation is an artefact of PDF extraction.
  const alnum = (t.match(/[\p{L}\p{N}]/gu) ?? []).length;
  if (alnum / t.length < 0.35) return "no content";
  return null;
}

/* ------------------------------------------------------------------ *
 * Line classification
 * ------------------------------------------------------------------ */

type LineKind = "heading" | "text" | "blank" | TheoryUnitType;

function classifyLine(line: string): LineKind {
  const t = line.trim();
  if (!t) return "blank";
  if (/^#{1,6}\s+\S/.test(t)) return "heading";
  // Numbered section titles: "2.3 Axiomatisk belastning"
  if (/^\d{1,2}(?:\.\d{1,2}){1,3}\s+[A-ZÅÄÖa-z]/.test(t) && t.length < 90 && !/[.!?]$/.test(t)) return "heading";
  if (CODE_DEF.test(t)) return "code_def";
  if (CODE_EVIDENCE.test(t) && CODE_MUTATION.test(t)) return "code_mutation";
  if (DEFINITION.test(t)) return "definition";
  if (AXIOM.test(t)) return "axiom";
  if (CLAIM.test(t)) return "claim";
  if (CODE_EVIDENCE.test(t) && CODE_CALL.test(t)) return "code_call";
  if (DERIVATION.test(t)) return "derivation";
  if (isFormulaLine(t)) return "formula";
  return "text";
}

function isHeadingLine(t: string): boolean {
  return t.length < 70 && !/[.!?;:]$/.test(t) && (mathRatio(t) < 0.1 || !t.includes("="));
}

/* ------------------------------------------------------------------ *
 * Extraction
 * ------------------------------------------------------------------ */

/**
 * Pull structural units out of a theory or code text.
 *
 * Display formulas ($$…$$, \[…\], \begin{…}) become their own nodes and are
 * never merged into a paragraph. Every other line is classified by the act it
 * performs (definition, axiom, claim, derivation, state mutation, call) and
 * kept whole. Prose keeps its full text.
 */
export function extractTheoryUnits(raw: string): TheoryExtraction {
  const text = raw.normalize("NFC").replace(/\r\n?/g, "\n").replace(/[ \u00a0]+/g, " ");
  const units: TheoryUnit[] = [];
  const dropped: NoiseDrop[] = [];
  const taken: boolean[] = new Array(text.length).fill(false);

  // Pass 1 — display formula blocks.
  FORMULA_BLOCK.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FORMULA_BLOCK.exec(text)) !== null) {
    const value = m[0].trim();
    const start = m.index + m[0].indexOf(m[0].trim());
    const end = start + value.length;
    if (value.length < 3) continue;
    let clash = false;
    for (let i = start; i < end; i++) if (taken[i]) { clash = true; break; }
    if (clash) continue;
    for (let i = start; i < end; i++) taken[i] = true;
    units.push({ text: value, unitType: "formula", start, end });
  }

  // Pass 2 — running headers/footers: a short line repeated across the document.
  const seen = new Map<string, number>();
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (t && t.length < 60) seen.set(t.toLowerCase(), (seen.get(t.toLowerCase()) ?? 0) + 1);
  }
  const repeated = new Set(
    [...seen.entries()].filter(([, n]) => n >= 3).map(([k]) => k)
  );

  const keepOrDrop = (s: string, start: number, end: number, kind: LineKind) => {
    if (kind === "heading") {
      if (s.trim().length >= 2) units.push({ text: s.trim(), unitType: "prose", start, end });
      return;
    }
    const trimmed = s.trim();
    if (trimmed && repeated.has(trimmed.toLowerCase())) {
      dropped.push({ text: trimmed.slice(0, 120), reason: "running header" });
      return;
    }
    const reason = isNoise(trimmed);
    if (reason) {
      dropped.push({ text: trimmed.slice(0, 120), reason });
      return;
    }
    // A structural act is kept at any length; plain prose needs substance.
    if (kind !== "text" && kind !== "prose") {
      units.push({ text: trimmed, unitType: kind, start, end });
      return;
    }
    if (trimmed.length < 25 && !isHeadingLine(trimmed)) {
      dropped.push({ text: trimmed.slice(0, 120), reason: "below min_chars" });
      return;
    }
    units.push({ text: trimmed, unitType: "prose", start, end });
  };

  let para = "";
  let paraStart = 0;
  const flushPara = (end: number) => {
    const chunk = para.trim();
    para = "";
    if (!chunk) return;
    for (const sentence of chunk.split(/(?<=[.!?])\s+(?=[A-Z0-9#*(\[\u00C0-\u00DE"'`])/)) {
      const s = sentence.trim();
      if (s) keepOrDrop(s, paraStart, end, classifyLine(s));
    }
  };

  let pos = 0;
  for (const line of text.split("\n")) {
    const lineStart = pos;
    const lineEnd = pos + line.length;
    pos = lineEnd + 1;
    const trimmed = line.trim();

    // A line swallowed by a display formula is already a node of its own.
    if (trimmed && taken[lineStart + (line.length - line.trimStart().length)]) {
      flushPara(lineStart);
      continue;
    }

    const kind = classifyLine(line);
    if (kind === "blank") {
      flushPara(lineStart);
      continue;
    }
    // A short line repeated through the document is page furniture, not content.
    if (kind === "text" && trimmed.length < 60 && repeated.has(trimmed.toLowerCase())) {
      flushPara(lineStart);
      dropped.push({ text: trimmed.slice(0, 120), reason: "running header" });
      continue;
    }
    if (kind === "text") {
      if (!para) paraStart = lineStart;
      para += (para ? " " : "") + trimmed;
      continue;
    }
    flushPara(lineStart);
    keepOrDrop(trimmed, lineStart, lineEnd, kind);
  }
  flushPara(text.length);

  units.sort((a, b) => a.start - b.start || a.text.localeCompare(b.text));
  return { units, dropped };
}

/** Convert theory units into chunker-compatible raw units. */
export function theoryUnitsToRaw(extraction: TheoryExtraction, sourceName: string): RawTextUnit[] {
  return extraction.units.map((u, i) => ({
    text: u.text,
    source: `${sourceName}#${u.unitType}@${u.start}`,
    position: i,
  }));
}
