import { describe, it, expect } from "vitest";
import { requiredBluffSuccess, vpipPfrRatio, csi, csiZone, speculativeRule, bubbleFactor, combos, pokerNumericAxes } from "@/lib/pokerMath";
import { getDomainProfile, lexicalAxisDetail } from "@/lib/domainProfiles";
import { calibratedFz } from "@/lib/domainLayer";

describe("poker math", () => {
  it("half-pot bluff must work 33%", () => expect(requiredBluffSuccess(0.5, 1)).toBeCloseTo(0.333, 2));
  it("pot-size bluff must work 50%", () => expect(requiredBluffSuccess(1, 1)).toBe(0.5));
  it("VPIP 35 / PFR 8 is above 2.5", () => expect(vpipPfrRatio(35, 8)).toBeGreaterThan(2.5));
  it("CSI 6 is push/fold", () => expect(csiZone(6)).toBe("push-fold"));
  it("CSI 10 is re-steal", () => expect(csiZone(csi(1500, 50, 100, 0, 0))).toBe("re-steal"));
  it("raise 12% of stack folds by rule of 10", () => expect(speculativeRule(12, 100)).toBe("fold"));
  it("raise 4% of stack calls by rule of 5", () => expect(speculativeRule(4, 100)).toBe("call"));
  it("bubble factor 1.8", () => expect(bubbleFactor(0.3, 0.12, 0.4)).toBeCloseTo(1.8, 5));
  it("AJo = 12 combos", () => expect(combos("AJo")).toBe(12));
  it("AJs = 4, 88 = 6", () => { expect(combos("AJs")).toBe(4); expect(combos("88")).toBe(6); });
  it("AA with one ace blocked = 3", () => expect(combos("AA", ["As"])).toBe(3));
});

describe("poker numeric axes", () => {
  it("bubble factor 1.8 gives high icm_pressure", () => expect(pokerNumericAxes("bubble factor 1.8 here").icm_pressure.score).toBeGreaterThanOrEqual(0.9));
  it("VPIP 35 PFR 8 is loose-passive", () => expect(pokerNumericAxes("VPIP 35 / PFR 8").range_polarity.score).toBe(0.9));
  it("paper tiger marks both poles", () => {
    const h = pokerNumericAxes("He has 3-bet 14% but fold to 3-bet 70%").defensive_honesty;
    expect(h.low > 0 && h.high > 0).toBe(true);
  });
  it("paper tiger earns the opposition bonus", () => {
    const p = getDomainProfile("poker");
    const d = lexicalAxisDetail("He has 3-bet 14% but fold to 3-bet 70%", p);
    const opposition = Object.values(d).some((x) => x.low > 0 && x.high > 0);
    const base = { llmTension: 0.3, triangulated: 0.3, cti: 0.1, distinctAxes: 1, directive: false };
    expect(calibratedFz({ ...base, opposition }, p.fzCalibration!)).toBeGreaterThan(calibratedFz({ ...base, opposition: false }, p.fzCalibration!));
  });
});
