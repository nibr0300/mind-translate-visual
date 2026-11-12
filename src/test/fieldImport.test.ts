import { describe, expect, it } from "vitest";
import { generateDemoField } from "../lib/fieldData";
import { parseFieldImport } from "../lib/fieldImport";
import { clusterDiameter, displayEdges } from "../lib/fieldRendering";

describe("saved field import", () => {
  it("restores legacy fields without domain axes unchanged", () => {
    const field = generateDemoField("didactics");
    expect(parseFieldImport(JSON.stringify(field))).toEqual(field);
  });
  it("restores missing vectors from saved positions without changing scores", () => {
    const field = generateDemoField("didactics");
    const raw = JSON.parse(JSON.stringify(field));
    delete raw.units[0].vector2d;
    const restored = parseFieldImport(JSON.stringify(raw));
    expect(restored.units[0].vector2d).toEqual([raw.units[0].pos.x, raw.units[0].pos.y]);
    expect(restored.units[0].degenerate).toBe(true);
    expect(restored.units[0].fz).toBe(raw.units[0].fz);
    expect(restored.units[0].fy).toBe(raw.units[0].fy);
  });
  it("skips missing required metrics instead of manufacturing tension values", () => {
    const field = generateDemoField("didactics");
    const raw = JSON.parse(JSON.stringify(field));
    raw.units[0].fz = null;
    const restored = parseFieldImport(JSON.stringify(raw));
    expect(restored.units).toHaveLength(field.units.length - 1);
    expect(restored.units.some(u => u.id === raw.units[0].id)).toBe(false);
    expect(restored.stats.totalUnits).toBe(field.units.length - 1);
    expect(restored.stats.boundaryUnits).toBe(restored.units.filter(u => u.fz > 0.65).length);
  });
  it("bounds the display graph while retaining all saved edges", () => {
    const field = generateDemoField("didactics");
    const edges = Array.from({ length: 3859 }, (_, i) => ({ source: "u0", target: `u${1 + i % 29}`, similarity: i / 3859 }));
    expect(displayEdges(edges, field.units, true)).toHaveLength(400);
    expect(displayEdges(edges, field.units, false)).toHaveLength(1200);
    expect(edges).toHaveLength(3859);
    expect(edges[0].similarity).toBe(0);
  });
  it("keeps large cluster graphics bounded", () => {
    expect(clusterDiameter(600, true)).toBe(320);
    expect(clusterDiameter(10000, false)).toBe(600);
  });
});
import { looksLikeSavedField } from "../lib/fieldImport";
describe("looksLikeSavedField", () => {
  it("recognises a saved field export", () => {
    expect(looksLikeSavedField(JSON.stringify({ units: [], clusters: [], stats: {} }))).toBe(true);
  });
  it("rejects ordinary JSON documents", () => {
    expect(looksLikeSavedField(JSON.stringify({ title: "hand history", hands: [] }))).toBe(false);
    expect(looksLikeSavedField("not json")).toBe(false);
  });
});
