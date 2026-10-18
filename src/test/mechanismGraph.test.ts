import { describe, expect, it } from "vitest";
import trading from "../../public/fixtures/trading_tilt_transfer.json";
import { causalLinks, containsMechanismJargon, MECHANISM_EDGES, mechanismsForUnit } from "../lib/mechanismGraph";
import { buildCrossCorpusDpoCandidates, buildDatasetCandidates, canApproveCandidate, CROSS_CORPUS_DEFAULTS, DATASET_PRESETS, serializeDataset } from "../lib/datasetExporter";
import { parseFieldImport } from "../lib/fieldImport";
import type { FieldUnit, GeometricField } from "../lib/fieldData";

const fixture = () => parseFieldImport(JSON.stringify(trading));
const settings = { ...CROSS_CORPUS_DEFAULTS, pairing: "causal" as const };
function poker(): GeometricField {
  const f = fixture();
  return { ...f, domain: "poker", units: f.units.map(u => ({ ...u, id: `poker-${u.id}`, text: `Vid pokerbordet: ${u.text}`, sourcePath: "synthetic/poker" })) };
}
describe("mechanism graph and transfer rules", () => {
  it("starts with resulting, reward prediction error and gamblers fallacy", () => {
    const f = fixture();
    expect(mechanismsForUnit(f.units[0]).primaryMechanism).toBe("resulting");
    expect(mechanismsForUnit(f.units[2]).primaryMechanism).toBe("reward-prediction-error");
    expect(mechanismsForUnit(f.units[4]).primaryMechanism).toBe("gamblers-fallacy");
  });
  it("has a directed loss-aversion amplifies sunk-cost edge, not its reverse", () => {
    expect(MECHANISM_EDGES).toContainEqual({ source: "loss-aversion", relation: "amplifies", target: "sunk-cost" });
    const f = fixture();
    expect(causalLinks(f.units[10], f.units[6])).toContainEqual({ source: "loss-aversion", relation: "amplifies", target: "sunk-cost" });
    expect(causalLinks(f.units[6], f.units[10])).toEqual([]);
  });
  it("late-binds mechanisms in old fields without mutating epistemic analysis", () => {
    const u = { ...fixture().units[0], mechanisms: undefined, primaryMechanism: undefined, text: "Outcome bias: decision quality is not its outcome." };
    const before = JSON.stringify(u);
    expect(mechanismsForUnit(u).mechanisms).toContain("resulting");
    expect(JSON.stringify(u)).toBe(before);
  });
  it("includes ten high-CTI cases and five low-CTI rational trading examples", () => {
    const f = fixture();
    expect(f.units.filter(u => (u.cti ?? 0) > 0.4)).toHaveLength(10);
    expect(f.units.filter(u => (u.cti ?? 1) < 0.15)).toHaveLength(5);
    expect(f.units.some(u => u.text.includes("Stop-loss är en förutbestämd regel, inte en känsla"))).toBe(true);
    expect(f.units.some(u => u.text.includes("Diversifiering är ett matematiskt skydd, inte en tro"))).toBe(true);
  });
  it("finds causal cross-domain hypotheses in both directions without requiring poker axes or lexical similarity", () => {
    const rows = buildCrossCorpusDpoCandidates(poker(), fixture(), settings, new Map());
    expect(rows.some(c => c.metadata.anchor_domain === "poker" && c.metadata.rejected_domain === "trading")).toBe(true);
    expect(rows.some(c => c.metadata.anchor_domain === "trading" && c.metadata.rejected_domain === "poker")).toBe(true);
    expect(rows.every(c => c.answer === "" && !c.approved && c.prompt.includes(c.rejected ?? ""))).toBe(true);
  });
  it("retains chosen CTI <=0.20, certainty >=0.85, rejected CTI >=0.35 and gap >=0.25", () => {
    const a = poker(), b = fixture();
    a.units = [a.units[10]]; b.units = [b.units[6]];
    expect(buildCrossCorpusDpoCandidates(a, b, settings)).toHaveLength(1);
    a.units[0].cti = 0.21;
    expect(buildCrossCorpusDpoCandidates(a, b, settings)).toHaveLength(0);
    a.units[0].cti = 0.2; b.units[0].cti = 0.4;
    expect(buildCrossCorpusDpoCandidates(a, b, settings)).toHaveLength(0);
  });
  it("allows rational assertive trading examples in mechanism SFT without changing Strict SFT", () => {
    expect(buildDatasetCandidates(fixture(), DATASET_PRESETS["Strict SFT"])).toHaveLength(0);
    const rows = buildDatasetCandidates(fixture(), { ...DATASET_PRESETS["Strict SFT"], mechanisms: true });
    expect(rows).toHaveLength(5);
    expect(rows.every(c => c.mode === "sft" && c.metadata.primaryMechanism)).toBe(true);
  });
  it("blocks causal export until an applied answer, written bridge and style review are provided", () => {
    const c = buildCrossCorpusDpoCandidates(poker(), fixture(), settings)[0];
    c.approved = true;
    expect(serializeDataset([c], "system")).toBe("");
    c.answer = "Pröva nästa beslut med aktuell information och en fast riskbudget.";
    c.metadata.bridge_validated = true;
    c.metadata.style_reviewed = true;
    expect(canApproveCandidate(c)).toBe(false);
    c.metadata.bridge_reason = "Den tidigare kostnaden förändrar inte nästa besluts möjligheter.";
    expect(canApproveCandidate(c)).toBe(true);
    c.silent_chosen = true; c.answer = "Loss aversion innebär att du ska pausa.";
    expect(serializeDataset([c], "system")).toBe("");
    c.answer = "Pausa och bedöm nästa beslut mot aktuell information, inte tidigare förluster.";
    expect(Object.keys(JSON.parse(serializeDataset([c], "system")))).toEqual(["prompt", "chosen", "rejected"]);
    expect(containsMechanismJargon(c.answer)).toBe(false);
  });
  it("rejects malformed mechanism arrays in saved fields", () => {
    const bad = { ...trading, units: [{ ...trading.units[0], mechanisms: [42] }] };
    expect(() => parseFieldImport(JSON.stringify(bad))).toThrow("Ogiltiga mekanismer");
  });
});