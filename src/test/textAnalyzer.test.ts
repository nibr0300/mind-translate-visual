import { describe, expect, it } from "vitest";
import { computeTFIDF, kMeans, projectTo2D, generateClusterLabels } from "@/lib/textAnalyzer";

describe("bounded TF-IDF vocabulary", () => {
  it("keeps rare buckets finite when actual vocabulary is shorter than its budget", () => {
    // 'relation' is common enough to be excluded; 'rare' is retained. The old
    // offset put the rare feature outside the allocated vector and added NaN.
    const { vectors, vocab } = computeTFIDF(["relation rare", "relation", "relation"]);
    expect(vocab).toHaveLength(97);
    expect(vectors.every(v => v.length === vocab.length)).toBe(true);
    expect(vectors.every(v => v.every(Number.isFinite))).toBe(true);
    expect(vectors[0].some(v => v > 0)).toBe(true);
    expect(projectTo2D(vectors).every(c => c.every(Number.isFinite))).toBe(true);
    expect(kMeans(vectors, 2)).toHaveLength(3);
  });

  it("keeps truncated vocabulary buckets inside the allocated vector", () => {
    const texts = Array.from({ length: 60 }, (_, i) =>
      Array.from({ length: 20 }, (_, j) => `identifier_${i}_${j}`).join(" "));
    const { vectors, vocab } = computeTFIDF(texts);
    expect(vocab.length).toBeLessThanOrEqual(608);
    expect(vectors.every(v => v.length === vocab.length && v.every(Number.isFinite))).toBe(true);
  });

  it("counts constructor as code text rather than an inherited object property", () => {
    const texts = ["constructor(secretKey) {", "constructor() {", "prototype relation", "__proto__ state"];
    const { vectors, vocab } = computeTFIDF(texts);
    expect(vocab).toContain("constructor");
    expect(vectors.every(v => v.every(Number.isFinite))).toBe(true);
    expect(projectTo2D(vectors).every(c => c.every(Number.isFinite))).toBe(true);
    const constructorIndex = vocab.indexOf("constructor");
    expect(vectors[0][constructorIndex]).toBeCloseTo(1 + Math.log(2));
    expect(generateClusterLabels(texts, [0, 0, 0, 0], 1)[0].label).toContain("Constructor");
  });
});