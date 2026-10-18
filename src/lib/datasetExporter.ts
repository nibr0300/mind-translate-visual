import type { FieldUnit, GeometricField } from "./fieldData";
import { getDomainProfile } from "./domainProfiles";

export type ExportMode = "sft" | "dpo";
export interface DatasetSettings {
  mode: ExportMode;
  certainty: number;
  maxCti: number;
  rejectedCti: number;
  deltaCti: number;
  similarity: number;
  neighbors: number;
}
export const DATASET_PRESETS = {
  "Strict SFT": { mode: "sft", certainty: 0.85, maxCti: 0.15, rejectedCti: 0.3, deltaCti: 0.25, similarity: 0.65, neighbors: 2 },
  "Balanced DPO": { mode: "dpo", certainty: 0.9, maxCti: 0.15, rejectedCti: 0.3, deltaCti: 0.25, similarity: 0.65, neighbors: 2 },
  "High Friction": { mode: "dpo", certainty: 0.9, maxCti: 0.15, rejectedCti: 0.4, deltaCti: 0.3, similarity: 0.65, neighbors: 2 },
} satisfies Record<string, DatasetSettings>;

export interface DatasetCandidate {
  id: string;
  mode: ExportMode;
  prompt: string;
  answer: string;
  rejected?: string;
  approved: boolean;
  metadata: {
    domain: string;
    node_id: string;
    context_nodes: string[];
    source_paths: string[];
    domain_axes: Record<string, number>;
    dominant_axis: string;
    cti: number;
    epistemic_certainty: number;
    speech_act: string;
    rejected_node?: string;
    rejected_cti?: number;
    edge_similarity?: number;
  };
}

export function questionForUnit(unit: FieldUnit, domain: string): { prompt: string; axis: string } | null {
  const templates = getDomainProfile(domain).questionTemplates;
  if (!templates) return null;
  const eligible = Object.entries(unit.domainAxes ?? {}).filter(([, score]) => Number.isFinite(score))
    .sort(([a, av], [b, bv]) => bv - av || a.localeCompare(b));
  for (const [axis, value] of eligible) {
    const definition = templates[axis];
    if (!definition) continue;
    const level = value >= definition.high.threshold ? definition.high
      : definition.medium && value >= definition.medium.threshold ? definition.medium : null;
    if (!level?.templates.length) continue;
    const hash = Array.from(unit.id).reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 0);
    return { prompt: level.templates[hash % level.templates.length], axis };
  }
  return null;
}

function validUnit(unit: FieldUnit): boolean {
  const certainty = unit.intention?.epistemicCertainty;
  return Boolean(unit.text.trim()) && !unit.degenerate && typeof certainty === "number"
    && Number.isFinite(certainty) && typeof unit.cti === "number" && Number.isFinite(unit.cti)
    && certainty >= 0 && certainty <= 1 && unit.cti >= 0 && unit.cti <= 1;
}

/** Only actual graph neighbours; never sequential document rows or unscored context. */
export function expandContext(field: GeometricField, seed: FieldUnit, settings: DatasetSettings): FieldUnit[] {
  const units = new Map(field.units.map(u => [u.id, u]));
  const neighbors = (field.edges ?? []).flatMap(edge => {
    const id = edge.source === seed.id ? edge.target : edge.target === seed.id ? edge.source : null;
    const unit = id ? units.get(id) : undefined;
    return unit && unit.id !== seed.id && unit.clusterId === seed.clusterId && validUnit(unit)
      && edge.similarity >= settings.similarity && (unit.cti ?? 1) < settings.maxCti
      && (unit.intention?.epistemicCertainty ?? 0) > settings.certainty
      ? [{ unit, similarity: edge.similarity }] : [];
  }).sort((a, b) => b.similarity - a.similarity || a.unit.id.localeCompare(b.unit.id));
  const selected = [seed];
  let words = seed.text.trim().split(/\s+/).length;
  for (const { unit } of neighbors) {
    if (selected.length > Math.min(2, settings.neighbors) || selected.some(u => u.id === unit.id || u.text.trim() === unit.text.trim())) continue;
    const extra = unit.text.trim().split(/\s+/).length;
    if (words + extra > 200) continue;
    selected.push(unit);
    words += extra;
  }
  return selected;
}

export function buildDatasetCandidates(field: GeometricField, settings: DatasetSettings, sourceName = ""): DatasetCandidate[] {
  const domain = field.domain ?? "general";
  const byId = new Map(field.units.map(u => [u.id, u]));
  const result: DatasetCandidate[] = [];
  const seen = new Set<string>();
  for (const unit of field.units) {
    if (!validUnit(unit) || (unit.cti ?? 1) >= settings.maxCti || (unit.intention?.epistemicCertainty ?? 0) <= settings.certainty) continue;
    if (unit.intention?.speechAct !== (settings.mode === "sft" ? "directive" : "assertive")) continue;
    const question = questionForUnit(unit, domain);
    if (!question) continue;
    const context = expandContext(field, unit, settings);
    const answer = context.map(u => u.text.trim()).join("\n\n");
    let rejectedUnit: FieldUnit | undefined;
    let similarity: number | undefined;
    if (settings.mode === "dpo") {
      const matching = (field.edges ?? []).flatMap(edge => {
        const otherId = edge.source === unit.id ? edge.target : edge.target === unit.id ? edge.source : null;
        const other = otherId ? byId.get(otherId) : undefined;
        return other && other.id !== unit.id && validUnit(other) && other.clusterId === unit.clusterId
          && edge.similarity >= settings.similarity && (other.cti ?? 0) > settings.rejectedCti
          && (other.cti ?? 0) - (unit.cti ?? 0) > settings.deltaCti
          && other.domainAxes?.[question.axis] !== undefined && other.text.trim() !== unit.text.trim()
          ? [{ unit: other, similarity: edge.similarity }] : [];
      }).sort((a, b) => b.similarity - a.similarity || a.unit.id.localeCompare(b.unit.id));
      rejectedUnit = matching[0]?.unit;
      similarity = matching[0]?.similarity;
      if (!rejectedUnit) continue;
    }
    const key = JSON.stringify([question.prompt, answer, rejectedUnit?.text]);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      id: `${settings.mode}:${unit.id}:${rejectedUnit?.id ?? ""}`, mode: settings.mode,
      prompt: question.prompt, answer, rejected: rejectedUnit?.text.trim(), approved: false,
      metadata: {
        domain, node_id: unit.id, context_nodes: context.map(u => u.id),
        source_paths: [...new Set(context.map(u => u.sourcePath || sourceName).filter(Boolean))],
        domain_axes: unit.domainAxes ?? {}, dominant_axis: question.axis,
        cti: unit.cti ?? 0, epistemic_certainty: unit.intention?.epistemicCertainty ?? 0,
        speech_act: unit.intention?.speechAct ?? "",
        ...(rejectedUnit ? { rejected_node: rejectedUnit.id, rejected_cti: rejectedUnit.cti, edge_similarity: similarity } : {}),
      },
    });
  }
  return result;
}

/** Training rows stay free of provider-specific metadata; provenance is a separate file. */
export function serializeDataset(candidates: DatasetCandidate[], system: string): string {
  return candidates.filter(c => c.approved && c.prompt.trim() && c.answer.trim()
    && (c.mode !== "dpo" || (c.rejected?.trim() && c.rejected.trim() !== c.answer.trim())))
    .map(c => JSON.stringify(c.mode === "sft" ? { messages: [
      { role: "system", content: system.trim() }, { role: "user", content: c.prompt.trim() },
      { role: "assistant", content: c.answer.trim() },
    ] } : { prompt: `${system.trim()}\n\n${c.prompt.trim()}`, chosen: c.answer.trim(), rejected: c.rejected?.trim() }))
    .join("\n");
}
/* ---------------- Cross-corpus DPO ---------------- */

export interface CrossCorpusSettings {
  similarity: number;
  chosenMaxCti: number;
  chosenCertainty: number;
  rejectedMinCti: number;
  deltaCti: number;
}
export const CROSS_CORPUS_DEFAULTS: CrossCorpusSettings = {
  similarity: 0.45, chosenMaxCti: 0.2, chosenCertainty: 0.85, rejectedMinCti: 0.35, deltaCti: 0.25,
};

export interface CrossMatch {
  axis: string;
  level: "high" | "medium";
  semantic: number;
  chosenAct: string;
  rejectedAct: string;
  promptMatch: boolean;
  chosenField: "A" | "B";
}

/** Which template level a unit reaches on an axis; null below medium. */
export function axisLevel(unit: FieldUnit, axis: string, domain: string): "high" | "medium" | null {
  const def = getDomainProfile(domain).questionTemplates?.[axis];
  const value = unit.domainAxes?.[axis];
  if (!def || typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value >= def.high.threshold) return "high";
  if (def.medium && value >= def.medium.threshold) return "medium";
  return null;
}

const STOP = new Set("the a an and or of to in on for is are was be it that this with as at by from you your if not but och att det som en ett är på i av för med till du om inte men har".split(" "));
function tokens(text: string): string[] {
  return text.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/)
    .filter(t => t.length > 2 && !STOP.has(t));
}

/** Deterministic TF-IDF cosine across both corpora; never compares per-run 2D coordinates. */
export function buildTfIdf(texts: string[]): Array<Map<string, number>> {
  const docs = texts.map(tokens);
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);
  const n = docs.length;
  return docs.map(d => {
    const tf = new Map<string, number>();
    for (const t of d) tf.set(t, (tf.get(t) ?? 0) + 1);
    const vec = new Map<string, number>();
    let norm = 0;
    for (const [t, c] of tf) { const w = c * Math.log(1 + n / (df.get(t) ?? 1)); vec.set(t, w); norm += w * w; }
    norm = Math.sqrt(norm) || 1;
    for (const [t, w] of vec) vec.set(t, w / norm);
    return vec;
  });
}
export function cosine(a: Map<string, number>, b: Map<string, number>): number {
  const [s, l] = a.size < b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [t, w] of s) dot += w * (l.get(t) ?? 0);
  return Math.round(dot * 1000) / 1000;
}

/**
 * Four-step pairing across two saved fields:
 * 1 shared axis, 2 text similarity, 3 diverging intention, 4 same template level (identical prompt).
 */
export interface CrossCorpusFunnel {
  chosen: number;
  rejected: number;
  chosenWithQuestion: number;
  sameAxisLevel: number;
  enoughCtiGap: number;
  bestSimilarity: number;
}

/** Counts how many nodes/pairs survive each cross-corpus step, so an empty
 *  result can say which check removed everything. Same rules as the builder. */
export function crossCorpusFunnel(a: GeometricField, b: GeometricField, s: CrossCorpusSettings = CROSS_CORPUS_DEFAULTS): CrossCorpusFunnel {
  const domain = a.domain ?? b.domain ?? "general";
  const all = [...a.units.map(u => ({ u, f: "A" as const })), ...b.units.map(u => ({ u, f: "B" as const }))].filter(x => validUnit(x.u));
  const chosen = all.filter(x => x.u.intention?.speechAct === "assertive" && (x.u.cti ?? 1) <= s.chosenMaxCti
    && (x.u.intention?.epistemicCertainty ?? 0) >= s.chosenCertainty);
  const rejected = all.filter(x => ["directive", "expressive"].includes(x.u.intention?.speechAct ?? "") && (x.u.cti ?? 0) >= s.rejectedMinCti);
  const withQ = chosen.flatMap(c => { const q = questionForUnit(c.u, domain); const level = q && axisLevel(c.u, q.axis, domain); return q && level ? [{ c, axis: q.axis, level }] : []; });
  const pairs: Array<[typeof all[number], typeof all[number]]> = [];
  let sameAxisLevel = 0;
  for (const { c, axis, level } of withQ) for (const r of rejected) {
    if (r.f === c.f || axisLevel(r.u, axis, domain) !== level || r.u.text.trim() === c.u.text.trim()) continue;
    sameAxisLevel++;
    if ((r.u.cti ?? 0) - (c.u.cti ?? 0) >= s.deltaCti) pairs.push([c, r]);
  }
  let bestSimilarity = 0;
  if (pairs.length) {
    const vecs = buildTfIdf(all.map(x => x.u.text));
    const at = new Map(all.map((x, i) => [x.u.text, i]));
    for (const [c, r] of pairs) bestSimilarity = Math.max(bestSimilarity, cosine(vecs[at.get(c.u.text)!], vecs[at.get(r.u.text)!]));
  }
  return { chosen: chosen.length, rejected: rejected.length, chosenWithQuestion: withQ.length, sameAxisLevel, enoughCtiGap: pairs.length, bestSimilarity };
}

export function buildCrossCorpusDpoCandidates(a: GeometricField, b: GeometricField, s: CrossCorpusSettings = CROSS_CORPUS_DEFAULTS): Array<DatasetCandidate & { match: CrossMatch }> {
  const domain = a.domain ?? b.domain ?? "general";
  const all = [...a.units.map(u => ({ u, f: "A" as const })), ...b.units.map(u => ({ u, f: "B" as const }))].filter(x => validUnit(x.u));
  const vecs = buildTfIdf(all.map(x => x.u.text));
  const idx = new Map(all.map((x, i) => [`${x.f}:${x.u.id}`, i]));
  const chosen = all.filter(x => x.u.intention?.speechAct === "assertive" && (x.u.cti ?? 1) <= s.chosenMaxCti
    && (x.u.intention?.epistemicCertainty ?? 0) >= s.chosenCertainty);
  const rejected = all.filter(x => ["directive", "expressive"].includes(x.u.intention?.speechAct ?? "") && (x.u.cti ?? 0) >= s.rejectedMinCti);
  const out: Array<DatasetCandidate & { match: CrossMatch }> = [];
  const usedRejected = new Set<string>();
  for (const c of chosen) {
    const q = questionForUnit(c.u, domain);
    if (!q) continue;
    const level = axisLevel(c.u, q.axis, domain);
    if (!level) continue;
    const cv = vecs[idx.get(`${c.f}:${c.u.id}`)!];
    let best: { r: typeof all[number]; sim: number } | null = null;
    for (const r of rejected) {
      if (r.f === c.f || usedRejected.has(`${r.f}:${r.u.id}`)) continue;
      if ((r.u.cti ?? 0) - (c.u.cti ?? 0) < s.deltaCti) continue;
      if (axisLevel(r.u, q.axis, domain) !== level) continue;
      if (r.u.text.trim() === c.u.text.trim()) continue;
      const sim = cosine(cv, vecs[idx.get(`${r.f}:${r.u.id}`)!]);
      if (sim < s.similarity) continue;
      if (!best || sim > best.sim || (sim === best.sim && r.u.id < best.r.u.id)) best = { r, sim };
    }
    if (!best) continue;
    usedRejected.add(`${best.r.f}:${best.r.u.id}`);
    const r = best.r.u;
    out.push({
      id: `cross:${c.f}:${c.u.id}:${best.r.f}:${r.id}`, mode: "dpo", prompt: q.prompt,
      answer: c.u.text.trim(), rejected: r.text.trim(), approved: false,
      metadata: {
        domain, node_id: c.u.id, context_nodes: [c.u.id], source_paths: [c.u.sourcePath, r.sourcePath].filter(Boolean) as string[],
        domain_axes: c.u.domainAxes ?? {}, dominant_axis: q.axis, cti: c.u.cti ?? 0,
        epistemic_certainty: c.u.intention?.epistemicCertainty ?? 0, speech_act: c.u.intention?.speechAct ?? "",
        rejected_node: r.id, rejected_cti: r.cti, edge_similarity: best.sim,
      },
      match: { axis: q.axis, level, semantic: best.sim, chosenAct: "assertive", rejectedAct: r.intention?.speechAct ?? "", promptMatch: true, chosenField: c.f },
    });
  }
  return out;
}
