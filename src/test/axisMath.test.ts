import { describe, it, expect } from "vitest";
import { axisWeights, axisFrictions } from "../../supabase/functions/_shared/axisMath";

describe("axis weights", () => {
  it("is 1 when clusters fully separate along the axis", () => {
    const units = [
      { clusterId: 0, axes: { exploit: 0 }, tension: 0.5 },
      { clusterId: 0, axes: { exploit: 0 }, tension: 0.5 },
      { clusterId: 1, axes: { exploit: 1 }, tension: 0.5 },
      { clusterId: 1, axes: { exploit: 1 }, tension: 0.5 },
    ];
    expect(axisWeights(units, ["exploit"])[0].weight).toBe(1);
  });

  it("is 0 when the axis does not distinguish clusters", () => {
    const units = [
      { clusterId: 0, axes: { exploit: 0 }, tension: 0 },
      { clusterId: 0, axes: { exploit: 1 }, tension: 0 },
      { clusterId: 1, axes: { exploit: 0 }, tension: 0 },
      { clusterId: 1, axes: { exploit: 1 }, tension: 0 },
    ];
    expect(axisWeights(units, ["exploit"])[0].weight).toBe(0);
  });
});

describe("axis frictions", () => {
  it("ranks the far-apart, high-tension pair first", () => {
    const units = [
      { clusterId: 0, axes: { exploit: 0 }, tension: 0.9 },
      { clusterId: 1, axes: { exploit: 1 }, tension: 0.9 },
      { clusterId: 2, axes: { exploit: 0.5 }, tension: 0.1 },
    ];
    const top = axisFrictions(units, ["exploit"])[0];
    expect(top.clusters).toEqual([0, 1]);
    expect(top.magnitude).toBe(0.9);
  });
});
