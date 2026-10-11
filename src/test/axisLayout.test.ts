import { describe, it, expect } from "vitest";
import { axisLayout } from "@/lib/axisLayout";
import type { FieldUnit } from "@/lib/fieldData";

const u = (axes?: Record<string, number>) => ({ id: "x", text: "", domainAxes: axes } as unknown as FieldUnit);

describe("axisLayout", () => {
  it("places high exploit to the right and high aggression at the top", () => {
    const [lo, hi] = axisLayout([u({ exploit: 0, aggression: 0 }), u({ exploit: 1, aggression: 1 })], "exploit", "aggression");
    expect(hi.x).toBeGreaterThan(lo.x);
    expect(hi.y).toBeLessThan(lo.y);
  });
  it("puts units without both scores in the unscored strip", () => {
    const [a, b] = axisLayout([u({ exploit: 0.4 }), u()], "exploit", "aggression");
    expect(a.scored).toBe(false);
    expect(b.y).toBe(96);
  });
});
