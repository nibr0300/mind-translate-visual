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