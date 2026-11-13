import { describe, it, expect } from "vitest";
import { extractTheoryUnits, corpusHash } from "@/lib/inputAdapters/theoryCodeExtractor";
import { getDomainProfile, lexicalAxisHits } from "@/lib/domainProfiles";

const FORMULA = "$$ F_Y = |\\langle\\psi|\\varphi\\rangle|^2 $$";

const FIXTURE = [
  "2.3 Axiomatisk belastning",
  "Definition 3.1. Låt F_Y beteckna resonansen mellan två intentionella vektorer.",
  "Vi antar att mänskliga känslor bildar en ortonormal bas i Hilbertrymet ℋ.",
  FORMULA,
  "Trivialt inses att F_Y ≤ 1.",
  "Alltså konvergerar sorg och frid mot samma gräns.",
  "Detta bevisar att arkitekturen är autonom.",
  "Kvantmekanisk superposition ger fältet en fenomenologisk grund.",
  "Sätter vi in definitionen i ekvation 2 får vi att F_Y är begränsad.",
  "Mätningar visar att F_Y sjunker. I kontrollen var skillnaden 0.12.",
  "def dream(self, state):",
  '    self.state = {"agency": state.agency + 0.15}',
  '    Action("dream", precondition={"mood": "low"}, effects={"agency": 0.15})',
  '    requests.post("https://api.example.com/v1/reflect", json=state)',
  "Det är bra.",
  "14",
  "=========",
  "Formelsamling och definitioner",
  "Formelsamling och definitioner",
  "Formelsamling och definitioner",
].join("\n");

const { units, dropped } = extractTheoryUnits(FIXTURE);
const typeOf = (needle: string) => units.find((u) => u.text.includes(needle))?.unitType;
const axisOn = (needle: string, axis: string) => {
  const u = units.find((x) => x.text.includes(needle));
  if (!u) throw new Error(`no unit containing "${needle}"`);
  return lexicalAxisHits(u.text, getDomainProfile("theory_code"))[axis];
};

describe("formal theory & code ingestion", () => {
  it("names the act each line performs", () => {
    expect(typeOf("beteckna resonansen")).toBe("definition");
    expect(typeOf("Vi antar att mänskliga")).toBe("axiom");
    expect(typeOf("Trivialt inses")).toBe("derivation");
    expect(typeOf("Alltså konvergerar")).toBe("derivation");
    expect(typeOf("Detta bevisar att arkitekturen")).toBe("claim");
    expect(typeOf("def dream")).toBe("code_def");
    expect(typeOf("self.state =")).toBe("code_mutation");
    expect(typeOf("effects=")).toBe("code_mutation");
    expect(typeOf("requests.post")).toBe("code_call");
  });

  it("keeps a display formula whole as its own node", () => {
    const formulas = units.filter((u) => u.unitType === "formula");
    expect(formulas.map((u) => u.text)).toContain(FORMULA);
    expect(formulas).toHaveLength(1);
  });

  it("drops page furniture with a reason and keeps every heading", () => {
    const reasons = Object.fromEntries(dropped.map((d) => [d.text, d.reason]));
    expect(reasons["14"]).toBe("page number");
    expect(reasons["========="]).toBe("separator");
    expect(reasons["Det är bra."]).toBe("below min_chars");
    expect(reasons["Formelsamling och definitioner"]).toBe("running header");
    expect(units.map((u) => u.text)).toContain("2.3 Axiomatisk belastning");
  });

  it("is deterministic and keeps offsets into the source", () => {
    expect(corpusHash(extractTheoryUnits(FIXTURE).units)).toBe(corpusHash(units));
    expect(units.every((u) => Number.isInteger(u.start) && u.end > u.start)).toBe(true);
  });

  it("a skipped step reads as tension, a shown substitution does not", () => {
    expect(axisOn("Trivialt inses", "derivation_step")).toBe(1);
    expect(axisOn("Sätter vi in definitionen", "derivation_step")).toBe(0);
  });

  it("an assumption lands on the axiomatic pole", () => {
    expect(axisOn("Vi antar att mänskliga", "axiomatic_burden")).toBe(1);
  });

  it("a borrowed physics term reads as a reification gap", () => {
    expect(axisOn("Kvantmekanisk superposition", "reification_gap")).toBe(1);
  });

  it("a claim with no measurement lands on claim > evidence", () => {
    expect(axisOn("Detta bevisar att arkitekturen", "claim_evidence_ratio")).toBe(1);
    expect(axisOn("Mätningar visar att F_Y sjunker", "claim_evidence_ratio")).toBeLessThan(0.2);
  });

  it("code is read by whether it reaches the world or only moves a number", () => {
    expect(axisOn("self.state =", "sim_vs_ground")).toBe(1);
    expect(axisOn("requests.post", "sim_vs_ground")).toBe(0);
  });

  it("a planner action with fixed effects is a functional call, not a boundary", () => {
    expect(axisOn("Action(\"dream\"", "control_asymmetry")).toBe(1);
    expect(axisOn("def dream", "control_asymmetry")).toBeUndefined();
  });

  it("the formula itself carries the notation load", () => {
    expect(axisOn("\\langle", "notation_load")).toBe(1);
  });

  it("profile has 8 axes in three families and a deterministic ground", () => {
    const p = getDomainProfile("theory_code");
    expect(p.axes).toHaveLength(8);
    expect(new Set(p.axes.map((a) => a.family))).toEqual(new Set(["Proof", "Ground", "Relation"]));
    expect(p.llmAxesByDefault).toBe(false);
    expect(p.fzCalibration?.directivePenalty).toBe(0);
  });
});
