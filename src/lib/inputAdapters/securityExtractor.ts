/**
 * Security-domain structural extraction (bug bounty profile).
 *
 * Endpoints, hostnames, paths, params, headers and error strings carry the
 * security signal. They must become their own units instead of being diluted
 * inside prose sentences, and they must never be split mid-token.
 *
 * Deterministic: same input always yields the same units in the same order.
 */
import type { RawTextUnit } from "../chunker";

export type SecurityUnitType =
  | "endpoint"
  | "hostname"
  | "path"
  | "param"
  | "header"
  | "error_string"
  | "code_symbol"
  | "prose";

export interface StructuralUnit {
  text: string;
  unitType: SecurityUnitType;
  /** Character offset in the normalized source text. */
  start: number;
  end: number;
}

export interface NoiseDrop {
  text: string;
  reason: string;
}

export interface SecurityExtraction {
  units: StructuralUnit[];
  dropped: NoiseDrop[];
}

const NOISE_PATTERNS: { re: RegExp; reason: string }[] = [
  { re: /^skip to (main )?content$/i, reason: "navigation" },
  { re: /^powered by\b/i, reason: "boilerplate" },
  { re: /^learn more\.?$/i, reason: "marketing" },
  { re: /^(home|back|next|previous|menu|close|search|share|print)$/i, reason: "navigation" },
  { re: /^(cookie|we use cookies)\b/i, reason: "cookie banner" },
  { re: /^(©|copyright)\s/i, reason: "footer" },
  { re: /^(follow us|sign up for our newsletter)\b/i, reason: "marketing" },
  { re: /^\d{1,2}[\s/-](jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s/-]\d{2,4}$/i, reason: "date line" },
  { re: /^\s*$/, reason: "empty" },
];

const HTTP_METHODS = "GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS";

const STRUCTURAL: { type: SecurityUnitType; re: RegExp }[] = [
  // METHOD /path/{id}
  { type: "endpoint", re: new RegExp(`\\b(?:${HTTP_METHODS})\\s+\\/[\\w{}./:*-]*`, "g") },
  // https://host/path  or bare hostnames
  { type: "hostname", re: /\bhttps?:\/\/[\w.-]+(?::\d+)?(?:\/[\w{}./:*%-]*)?|\b(?:[a-z0-9*](?:[a-z0-9-]*[a-z0-9])?\.)+(?:com|net|org|io|dev|app|co|ai|cloud|sh|xyz|se)\b/gi },
  // Standalone API-ish paths
  { type: "path", re: /(?:^|[\s"'`(])(\/(?:api|v\d|graphql|admin|internal|auth|oauth|user|account|\.well-known)[\w{}./:*-]*)/gi },
  // Query parameters
  { type: "param", re: /[?&]([A-Za-z_][\w.-]{1,40})=/g },
  // Custom / auth headers
  { type: "header", re: /\b(?:X-[A-Za-z0-9-]{2,40}|Authorization|Set-Cookie|Content-Security-Policy|Access-Control-Allow-[A-Za-z-]+|Strict-Transport-Security)\b\s*:?/g },
  // Error strings / status conditions
  { type: "error_string", re: /\b(?:[45]\d{2}\s+[A-Z][\w ]{2,40}|(?:invalid|expired|unauthorized|forbidden|not found|permission denied|access denied)[\w ]{0,30})/gi },
];

function isNoise(text: string): string | null {
  const t = text.trim();
  if (t.length < 3) return "too short";
  for (const { re, reason } of NOISE_PATTERNS) if (re.test(t)) return reason;
  // A line of pure punctuation or separators
  if (!/[a-z0-9]/i.test(t)) return "no content";
  return null;
}

/**
 * Pull structural units out of a text, then return the remaining prose split
 * into sentences. Structural matches are blanked out of the prose stream so a
 * path is never cut in half by sentence splitting.
 */
export function extractSecurityUnits(raw: string): SecurityExtraction {
  const text = raw.normalize("NFC").replace(/[ \t\u00a0]+/g, " ");
  const units: StructuralUnit[] = [];
  const dropped: NoiseDrop[] = [];
  const taken: boolean[] = new Array(text.length).fill(false);

  for (const { type, re } of STRUCTURAL) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const captured = m[1] ?? m[0];
      const start = m.index + m[0].indexOf(captured);
      const end = start + captured.length;
      if (taken[start] || taken[end - 1]) continue;
      const value = captured.trim().replace(/[?&=]$/, "").replace(/:$/, "");
      if (value.length < 3) continue;
      for (let i = start; i < end; i++) taken[i] = true;
      units.push({ text: value, unitType: type, start, end });
    }
  }

  // Prose = everything not consumed by a structural match.
  let buffer = "";
  let bufferStart = 0;
  const flush = (end: number) => {
    const chunk = buffer.trim();
    buffer = "";
    if (!chunk) return;
    for (const sentence of chunk.split(/(?<=[.!?])\s+|\n{2,}/)) {
      const s = sentence.trim();
      if (!s) continue;
      const reason = isNoise(s);
      if (reason) {
        dropped.push({ text: s.slice(0, 120), reason });
        continue;
      }
      if (s.length < 25) {
        dropped.push({ text: s.slice(0, 120), reason: "below min_chars" });
        continue;
      }
      units.push({ text: s, unitType: "prose", start: bufferStart, end });
    }
  };

  for (let i = 0; i < text.length; i++) {
    if (taken[i]) {
      flush(i);
      bufferStart = i + 1;
      continue;
    }
    if (!buffer) bufferStart = i;
    buffer += text[i];
  }
  flush(text.length);

  units.sort((a, b) => a.start - b.start || a.text.localeCompare(b.text));
  return { units, dropped };
}

/** Convert structural units into chunker-compatible raw units. */
export function securityUnitsToRaw(
  extraction: SecurityExtraction,
  sourceName: string
): RawTextUnit[] {
  return extraction.units.map((u, i) => ({
    text: u.text,
    source: `${sourceName}#${u.unitType}@${u.start}`,
    position: i,
  }));
}

/** FNV-1a over a canonical serialization — deterministic corpus fingerprint. */
export function corpusHash(units: { text: string; unitType?: string }[]): string {
  const canonical = units.map((u) => `${u.unitType ?? "prose"}\u0001${u.text}`).join("\u0002");
  let h = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    h ^= canonical.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** SimHash over token shingles, used for near-duplicate detection. */
export function simHash(text: string): bigint {
  const tokens = text.toLowerCase().match(/[\w/{}.:-]+/g) ?? [];
  const bits = new Array(64).fill(0);
  for (const token of tokens) {
    let h = 0xcbf29ce4n;
    for (let i = 0; i < token.length; i++) {
      h ^= BigInt(token.charCodeAt(i));
      h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
    }
    for (let b = 0; b < 64; b++) bits[b] += (h >> BigInt(b)) & 1n ? 1 : -1;
  }
  let out = 0n;
  for (let b = 0; b < 64; b++) if (bits[b] > 0) out |= 1n << BigInt(b);
  return out;
}

export function simHashSimilarity(a: bigint, b: bigint): number {
  let x = a ^ b;
  let distance = 0;
  while (x) {
    distance += Number(x & 1n);
    x >>= 1n;
  }
  return 1 - distance / 64;
}

/**
 * Near-duplicate collapse. Keeps the copy from the highest-weighted source.
 * Returns the surviving units in input order.
 */
export function dedupeNearDuplicates<T extends { text: string; weight?: number }>(
  items: T[],
  threshold = 0.92
): T[] {
  const kept: { item: T; hash: bigint; index: number }[] = [];
  for (const [index, item] of items.entries()) {
    const hash = simHash(item.text);
    const twin = kept.find((k) => simHashSimilarity(k.hash, hash) >= threshold);
    if (!twin) {
      kept.push({ item, hash, index });
      continue;
    }
    if ((item.weight ?? 0) > (twin.item.weight ?? 0)) twin.item = item;
  }
  return kept.sort((a, b) => a.index - b.index).map((k) => k.item);
}
