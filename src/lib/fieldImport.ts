import type { GeometricField } from "./fieldData";

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const vector = (value: unknown) => Array.isArray(value) && value.length === 2 && value.every(finite);

/** Cheap shape check: does this JSON text look like a saved field export? */
export function looksLikeSavedField(text: string): boolean {
  try {
    const value: unknown = JSON.parse(text);
    return record(value) && Array.isArray(value.units) && Array.isArray(value.clusters) && record(value.stats);
  } catch {
    return false;
  }
}

/** Validate saved fields without regenerating or changing their analysis. */
export function parseFieldImport(text: string): GeometricField {
  const field: unknown = JSON.parse(text);
  if (!record(field) || !Array.isArray(field.units) || !field.units.length || !Array.isArray(field.clusters) || !record(field.stats)) throw new Error("Inte ett sparat fält");
  const ids = new Set<string>();
  for (const unit of field.units) {
    if (!record(unit) || typeof unit.id !== "string" || ids.has(unit.id) || typeof unit.text !== "string" || !vector(unit.vector2d) || !finite(unit.clusterId) || !finite(unit.fz) || !finite(unit.fy)) throw new Error("Ogiltig nod i fältet");
    ids.add(unit.id);
    for (const key of ["intention", "triangulation"] as const) {
      const annotation = unit[key];
      if (annotation != null && (!record(annotation) || Object.entries(annotation).some(([name, value]) => name !== "speechAct" && !finite(value)))) throw new Error("Ogiltig analys i fältet");
    }
  }
  if (field.clusters.some(cluster => !record(cluster) || !finite(cluster.id) || !vector(cluster.center) || typeof cluster.label !== "string" || !finite(cluster.unitCount) || !finite(cluster.avgFZ) || !finite(cluster.avgFY))) throw new Error("Ogiltigt kluster i fältet");
  if (![field.stats.totalUnits, field.stats.boundaryUnits, field.stats.avgFZ, field.stats.avgFY].every(finite)) throw new Error("Ogiltig statistik i fältet");
  if (field.edges != null && (!Array.isArray(field.edges) || field.edges.some(edge => !record(edge) || typeof edge.source !== "string" || typeof edge.target !== "string" || !finite(edge.similarity)))) throw new Error("Ogiltiga förbindelser i fältet");
  return field as unknown as GeometricField;
}