import type { FieldEdge, FieldUnit } from "./fieldData";

/** Display budgets never modify the saved graph used for analysis/export. */
export function displayEdges(edges: FieldEdge[], units: FieldUnit[], lite: boolean) {
  const indexes = new Map(units.map((unit, index) => [unit.id, index]));
  return edges.filter(edge => indexes.has(edge.source) && indexes.has(edge.target) && Number.isFinite(edge.similarity))
    .sort((a, b) => b.similarity - a.similarity || a.source.localeCompare(b.source) || a.target.localeCompare(b.target))
    .slice(0, lite ? 400 : 1200)
    .map(edge => ({ source: indexes.get(edge.source) ?? 0, target: indexes.get(edge.target) ?? 0, similarity: edge.similarity }));
}

export function clusterDiameter(count: number, lite: boolean) {
  return Math.min(lite ? 320 : 600, 60 + Math.sqrt(Math.max(0, count)) * 18);
}