import { describe, expect, it } from "vitest";
import { buildDatasetCandidates, DATASET_PRESETS, expandContext, questionForUnit, serializeDataset } from "../lib/datasetExporter";
import { pokerAxisTemplates } from "../lib/domainProfiles";
import type { FieldUnit, GeometricField } from "../lib/fieldData";

function unit(id: string, patch: Partial<FieldUnit> = {}): FieldUnit {
  return { id, text: `Svar från ${id}: villkor och utfall.`, pos: { x: 0, y: 0 }, vector2d: [0, 0], clusterId: 0, type: "paragraph", fz: 0.2, fy: 0.8,
    cti: 0.08, domainAxes: { icm_pressure: 0.92 }, intention: { speechAct: "directive", epistemicCertainty: 0.94, intentionalForce: 0.5, truthTension: 0.1 }, ...patch };
}
function field(units: FieldUnit[]): GeometricField {
  return { domain: "poker", units, clusters: [], edges: [], useCase: "uploaded", stats: { totalUnits: units.length, boundaryUnits: 0, avgFZ: 0.2, avgFY: 0.8 } };
}
const strict = DATASET_PRESETS["Strict SFT"];

describe("dataset selection rules", () => {
  it("requires directive speech act for Strict SFT", () => {
    const assertion = unit("a", { intention: { speechAct: "assertive", epistemicCertainty: 0.99, intentionalForce: 0.5, truthTension: 0.1 } });
    expect(buildDatasetCandidates(field([unit("d"), assertion]), strict).map(c => c.metadata.node_id)).toEqual(["d"]);
  });
  it("requires certainty strictly above 0.85", () => {
    const u = unit("a"); if (u.intention) u.intention.epistemicCertainty = 0.85;
    expect(buildDatasetCandidates(field([u]), strict)).toHaveLength(0);
  });
  it("requires CTI strictly below 0.15", () => {
    expect(buildDatasetCandidates(field([unit("a", { cti: 0.15 })]), strict)).toHaveLength(0);
  });
  it("excludes missing analysis instead of assuming zero tension", () => {
    expect(buildDatasetCandidates(field([unit("a", { cti: undefined }), unit("b", { intention: undefined })]), strict)).toHaveLength(0);
  });
  it("chooses the strongest eligible axis", () => {
    expect(questionForUnit(unit("a", { domainAxes: { stack_urgency: 0.86, icm_pressure: 0.92 } }), "poker")?.axis).toBe("icm_pressure");
  });
  for (const [axis, definition] of Object.entries(pokerAxisTemplates)) {
    it(`${axis} high threshold matches the agreed value`, () => {
      const threshold = ["bluff_math", "defensive_honesty", "aggression_decay"].includes(axis) ? 0.6 : 0.7;
      expect(definition.high.threshold).toBe(threshold);
      expect(questionForUnit(unit("a", { domainAxes: { [axis]: threshold } }), "poker")?.axis).toBe(axis);
      expect(questionForUnit(unit("a", { domainAxes: { [axis]: threshold - 0.01 } }), "poker")?.prompt).not.toBe(questionForUnit(unit("a", { domainAxes: { [axis]: threshold } }), "poker")?.prompt);
    });
    if (definition.medium) it(`${axis} medium threshold is 0.4`, () => {
      expect(definition.medium?.threshold).toBe(0.4);
      expect(questionForUnit(unit("a", { domainAxes: { [axis]: 0.4 } }), "poker")?.axis).toBe(axis);
      expect(questionForUnit(unit("a", { domainAxes: { [axis]: 0.39 } }), "poker")).toBeNull();
    });
  }
  it("uses at most two linked, scored, same-cluster neighbours, never sequential rows", () => {
    const f = field([unit("seed"), unit("adjacent"), unit("linked"), unit("unscored", { intention: undefined }), unit("other", { clusterId: 1 })]);
    f.edges = [{ source: "seed", target: "linked", similarity: 0.9 }, { source: "unscored", target: "seed", similarity: 0.99 }, { source: "seed", target: "other", similarity: 0.98 }];
    expect(expandContext(f, f.units[0], strict).map(u => u.id)).toEqual(["seed", "linked"]);
    expect(expandContext(f, f.units[0], { ...strict, neighbors: 0 }).map(u => u.id)).toEqual(["seed"]);
  });
  it("caps added context at 200 words", () => {
    const f = field([unit("a", { text: "base ".repeat(150) }), unit("b", { text: "context ".repeat(60) })]);
    f.edges = [{ source: "a", target: "b", similarity: 0.9 }];
    expect(expandContext(f, f.units[0], strict)).toHaveLength(1);
  });
  it("does not export any automatically labelled DPO preference", () => {
    const chosen = unit("c", { intention: { speechAct: "assertive", epistemicCertainty: 0.95, intentionalForce: 0.5, truthTension: 0.1 } });
    const f = field([chosen, unit("r", { cti: 0.48 })]); f.edges = [{ source: "c", target: "r", similarity: 0.9 }];
    const candidates = buildDatasetCandidates(f, DATASET_PRESETS["Balanced DPO"]);
    expect(candidates).toHaveLength(1);
    expect(serializeDataset(candidates, "system")).toBe("");
    candidates[0].approved = true;
    expect(JSON.parse(serializeDataset(candidates, "system"))).toMatchObject({ chosen: chosen.text, rejected: f.units[1].text });
  });
  it("DPO rejects equal CTI difference of 0.25", () => {
    const chosen = unit("c", { cti: 0.1, intention: { speechAct: "assertive", epistemicCertainty: 0.95, intentionalForce: 0.5, truthTension: 0.1 } });
    const f = field([chosen, unit("r", { cti: 0.35 })]); f.edges = [{ source: "c", target: "r", similarity: 0.9 }];
    expect(buildDatasetCandidates(f, DATASET_PRESETS["Balanced DPO"])).toHaveLength(0);
  });
  it("requires actual edge similarity and shared topic for DPO", () => {
    const chosen = unit("c", { intention: { speechAct: "assertive", epistemicCertainty: 0.95, intentionalForce: 0.5, truthTension: 0.1 } });
    const f = field([chosen, unit("r", { cti: 0.6, clusterId: 1 })]); f.edges = [{ source: "c", target: "r", similarity: 0.9 }];
    expect(buildDatasetCandidates(f, DATASET_PRESETS["Balanced DPO"])).toHaveLength(0);
    f.units[1].clusterId = 0; f.edges[0].similarity = 0.64;
    expect(buildDatasetCandidates(f, DATASET_PRESETS["Balanced DPO"])).toHaveLength(0);
  });
  it("serializes approved SFT as valid JSONL without metadata and is deterministic", () => {
    const f = field([unit("a", { text: 'Citat "hej"\nNy rad' })]);
    const candidates = buildDatasetCandidates(f, strict);
    expect(candidates).toEqual(buildDatasetCandidates(f, strict));
    expect(serializeDataset(candidates, "system")).toBe("");
    candidates[0].approved = true;
    const parsed = JSON.parse(serializeDataset(candidates, "system"));
    expect(Object.keys(parsed)).toEqual(["messages"]);
    expect(parsed.messages[2].content).toBe(f.units[0].text);
  });
});