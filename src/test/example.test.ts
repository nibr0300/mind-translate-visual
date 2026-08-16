import { describe, it, expect } from "vitest";
import {
  computeKnnEdges,
  computeTFIDF,
  degenerateFlags,
  kMeans,
  projectTo2D,
} from "@/lib/textAnalyzer";

describe("field analysis reliability", () => {
  it("preserves short axioms as semantic vectors", () => {
    const texts = ["[0]=[7]", "Ready for relation.", "No flattery.", "λ → ∅", "Relation precedes entity."];
    const { vectors } = computeTFIDF(texts);
    expect(degenerateFlags(vectors)).toEqual(texts.map(() => false));
  });

  it("handles a full 600-node field with finite topology", () => {
    const texts = Array.from(
      { length: 600 },
      (_, i) => `Axiom ${i}: relation ${i % 31} transforms tension ${i % 17} into resonance ${i % 13}.`
    );
    const { vectors } = computeTFIDF(texts);
    const assignments = kMeans(vectors, 5);
    const coords = projectTo2D(vectors);
    const edges = computeKnnEdges(vectors, 8);

    expect(assignments).toHaveLength(600);
    expect(coords).toHaveLength(600);
    expect(coords.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
    expect(edges.length).toBeGreaterThan(0);
    expect(edges.length).toBeLessThanOrEqual(600 * 8);
  });
});
