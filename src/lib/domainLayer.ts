import type { FieldUnit } from "./fieldData";
import { lexicalAxisHits, type DomainProfile } from "./domainProfiles";

/**
 * Lexical hits are deterministic and win; LLM scores only fill axes where the
 * dictionaries found nothing (-1 from the LLM means "not applicable").
 */
export function applyLexicalAxes(units: FieldUnit[], profile: DomainProfile) {
  if (!profile.axisDictionaries) return;
  for (const u of units) {
    const lexical = lexicalAxisHits(u.text, profile);
    const llm = Object.fromEntries(Object.entries(u.domainAxes ?? {}).filter(([, v]) => v >= 0));
    const merged = { ...llm, ...lexical };
    if (Object.keys(merged).length) u.domainAxes = merged;
  }
}

/** Source weight scales tension and CTI: scope (1.0) outranks a blog (0.5). */
export function applySourceWeight(units: FieldUnit[], weight: number) {
  const w = Math.max(0, Math.min(1, weight));
  for (const u of units) {
    u.fz = Math.round(u.fz * w * 1000) / 1000;
    if (typeof u.cti === "number") u.cti = Math.round(u.cti * w * 1000) / 1000;
  }
}
