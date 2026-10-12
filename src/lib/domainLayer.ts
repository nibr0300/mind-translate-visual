import type { FieldUnit, FieldCluster } from "./fieldData";
import { lexicalAxisDetail, type AxisHitDetail, type DomainProfile, type FzCalibration } from "./domainProfiles";

/** Rule-like lines: they state policy, they are not tensions in themselves. */
export const DIRECTIVE_RE =
  /^(no |do not |don't |stay |keep |use |avoid |one report|poc or|rate limit|must |shall )/i;

export function isDirective(text: string): boolean {
  return DIRECTIVE_RE.test(text.trim().replace(/^[#*\-•\s]+/, ""));
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * Lexical hits are deterministic and win; LLM scores only fill axes where the
 * dictionaries found nothing (-1 from the LLM means "not applicable").
 * Returns the per-unit hit details for downstream FZ calibration.
 */
export function applyLexicalAxes(units: FieldUnit[], profile: DomainProfile): Map<string, Record<string, AxisHitDetail>> {
  const details = new Map<string, Record<string, AxisHitDetail>>();
  if (!profile.axisDictionaries) return details;
  for (const u of units) {
    const detail = lexicalAxisDetail(u.text, profile);
    details.set(u.id, detail);
    const lexical = Object.fromEntries(Object.entries(detail).map(([k, d]) => [k, d.score]));
    const llm = Object.fromEntries(Object.entries(u.domainAxes ?? {}).filter(([, v]) => v >= 0));
    const merged = { ...llm, ...lexical };
    if (Object.keys(merged).length) u.domainAxes = merged;
  }
  return details;
}

/**
 * Contrast-based FZ: rewards tension, triangulation and axis spread — not
 * directive force or isolation. Degree only steers layout and is never used.
 */
export function calibratedFz(
  input: { llmTension: number; triangulated: number; cti: number; distinctAxes: number; opposition: boolean; directive: boolean },
  w: FzCalibration
): number {
  const raw = w.llmTension * input.llmTension + w.triangulated * input.triangulated + w.cti * input.cti;
  const axisBonus = w.axisBonus * Math.min(1, input.distinctAxes / 3);
  const opposition = input.opposition ? w.oppositionBonus : 0;
  const penalty = input.directive && input.triangulated < 0.4 ? w.directivePenalty : 0;
  return round3(clamp01(raw + axisBonus + opposition - penalty));
}

export function recalibrateFz(units: FieldUnit[], details: Map<string, Record<string, AxisHitDetail>>, w: FzCalibration) {
  for (const u of units) {
    const d = details.get(u.id) ?? {};
    const hits = Object.values(d);
    u.fz = calibratedFz(
      {
        llmTension: u.triangulation?.llmTension ?? 0,
        triangulated: u.triangulation?.triangulated ?? 0,
        cti: u.cti ?? 0,
        distinctAxes: hits.length,
        opposition: hits.some((h) => h.low > 0 && h.high > 0),
        directive: isDirective(u.text),
      },
      w
    );
  }
}

/** Source weight scales tension and CTI by 0.5 + 0.5·weight: scope (1.0) keeps all, a blog (0.5) keeps 75%. */
export function applySourceWeight(units: FieldUnit[], weight: number) {
  const f = 0.5 + 0.5 * clamp01(weight);
  for (const u of units) {
    u.fz = round3(u.fz * f);
    if (typeof u.cti === "number") u.cti = round3(u.cti * f);
  }
}

/** Readable cluster labels from the dominant domain-axis poles ("race + stateless", "trust boundary"). */
export function axisClusterLabels(units: FieldUnit[], clusters: FieldCluster[], profile: DomainProfile) {
  for (const c of clusters) {
    const sums = new Map<string, { low: number; high: number }>();
    for (const u of units) {
      if (u.clusterId !== c.id || !u.domainAxes) continue;
      for (const [k, v] of Object.entries(u.domainAxes)) {
        const s = sums.get(k) ?? { low: 0, high: 0 };
        s.low += 1 - v;
        s.high += v;
        sums.set(k, s);
      }
    }
    const ranked = [...sums.entries()].sort((a, b) => b[1].low + b[1].high - (a[1].low + a[1].high));
    if (!ranked.length) continue;
    const words = ranked.slice(0, 2).map(([key, s]) => {
      const axis = profile.axes.find((a) => a.key === key);
      if (!axis) return key;
      const ratio = s.high / (s.low + s.high);
      if (ratio > 0.35 && ratio < 0.65) return `${axis.low} + ${axis.high}`;
      return ratio >= 0.65 ? axis.high : axis.low;
    });
    if (!c.description?.includes(c.label)) c.description = `${c.label}${c.description ? " — " + c.description : ""}`;
    c.label = [...new Set(words)].join(" · ");
  }
}
