import type { FieldUnit, GeometricField } from "./fieldData";

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

export interface FieldImportReport {
  repairedNodes: number;
  skippedNodes: number;
  removedEdges: number;
  details: string[];
}

export function fieldImportSummary(report: FieldImportReport): string {
  return `Import: ${report.repairedNodes} noder reparerade, ${report.skippedNodes} noder överhoppade, ${report.removedEdges} förbindelser borttagna.`;
}

/** Recover structure only. Never invent missing tension scores or rerun analysis. */
export function parseFieldImport(text: string, onRepair?: (report: FieldImportReport) => void): GeometricField {
  const field: unknown = JSON.parse(text);
  if (!record(field) || !Array.isArray(field.units) || !field.units.length || !Array.isArray(field.clusters) || !record(field.stats)) throw new Error("Inte ett sparat fält");
  const report: FieldImportReport = { repairedNodes: 0, skippedNodes: 0, removedEdges: 0, details: [] };
  const detail = (message: string) => { if (report.details.length < 30) report.details.push(message); };
  const clusters = new Map<number, Record<string, unknown>>();
  for (const cluster of field.clusters) {
    if (record(cluster) && finite(cluster.id) && !clusters.has(cluster.id)) clusters.set(cluster.id, cluster);
  }
  const ids = new Set<string>();
  const ambiguous = new Set<string>();
  const units: FieldUnit[] = [];
  for (const [index, raw] of field.units.entries()) {
    const label = record(raw) && typeof raw.id === "string" ? raw.id : `#${index + 1}`;
    const skip = (reason: string) => { report.skippedNodes++; detail(`${label}: ${reason}`); };
    if (!record(raw) || typeof raw.id !== "string" || !raw.id.trim() || typeof raw.text !== "string" || !raw.text.trim()) { skip("saknar ID eller text"); continue; }
    if (ids.has(raw.id)) { ambiguous.add(raw.id); skip("duplicerat ID"); continue; }
    // Missing scores cannot honestly be repaired with zero or a cluster average.
    if (!finite(raw.fz) || !finite(raw.fy)) { skip("saknar giltig FZ eller FY; inga värden har uppskattats"); continue; }
    const unit = { ...raw };
    let repaired = false;
    const repair = (reason: string) => { repaired = true; detail(`${label}: ${reason}`); };
    if (!finite(unit.clusterId)) {
      if (clusters.size !== 1) { skip("klustertillhörighet saknas och kan inte bestämmas"); continue; }
      unit.clusterId = clusters.keys().next().value;
      repair("återställd till det enda sparade klustret");
    }
    if (!vector(unit.vector2d)) {
      const center = finite(unit.clusterId) ? clusters.get(unit.clusterId)?.center : undefined;
      if (record(unit.pos) && finite(unit.pos.x) && finite(unit.pos.y)) unit.vector2d = [unit.pos.x, unit.pos.y];
      else if (vector(center)) unit.vector2d = [...center as number[]];
      else { skip("saknar både koordinater och en sparad reservposition"); continue; }
      unit.degenerate = true;
      repair("återställd visningsposition; inte semantisk likhet");
    }
    if (!record(unit.pos) || !finite(unit.pos.x) || !finite(unit.pos.y)) {
      const coordinates = unit.vector2d as number[];
      unit.pos = { x: coordinates[0], y: coordinates[1] };
      repair("återställd position från vector2d");
    }
    if (!["heading", "paragraph", "fragment"].includes(String(unit.type))) { unit.type = "paragraph"; repair("återställd texttyp"); }
    if (unit.mechanisms != null && (!Array.isArray(unit.mechanisms) || !unit.mechanisms.every(m => typeof m === "string"))) {
      unit.mechanisms = Array.isArray(unit.mechanisms) ? unit.mechanisms.filter(m => typeof m === "string") : [];
      repair("ogiltiga mekanismetiketter borttagna");
    }
    if (unit.primaryMechanism != null && typeof unit.primaryMechanism !== "string") { delete unit.primaryMechanism; repair("ogiltig primär mekanism borttagen"); }
    for (const key of ["intention", "triangulation"] as const) {
      const annotation = unit[key];
      if (annotation == null) continue;
      const required = key === "intention" ? ["epistemicCertainty", "intentionalForce", "truthTension"] : ["llmTension", "lexicalTension", "discrepancy", "clusterDeviation", "triangulated"];
      const speechActs = ["assertive", "directive", "commissive", "expressive", "declarative"];
      if (!record(annotation) || required.some(name => !finite(annotation[name])) || (key === "intention" && !speechActs.includes(String(annotation.speechAct)))) {
        delete unit[key]; repair(`${key}: ofullständig analys borttagen, inte ersatt med noll`); continue;
      }
      const cleaned = { ...annotation };
      if (key === "intention") for (const name of ["moralTension", "narrativeTension", "denialMarker"]) {
        if (name in cleaned && !finite(cleaned[name])) { delete cleaned[name]; repair(`${name}: ogiltigt frivilligt värde borttaget`); }
      }
      unit[key] = cleaned;
    }
    for (const key of ["cti", "degree", "weightedCentrality"] as const) {
      if (key in unit && !finite(unit[key])) { delete unit[key]; repair(`${key}: ogiltigt frivilligt värde borttaget`); }
    }
    if (unit.domainAxes != null) {
      if (!record(unit.domainAxes)) { delete unit.domainAxes; repair("ogiltiga domänaxlar borttagna"); }
      else {
        const axes = Object.fromEntries(Object.entries(unit.domainAxes).filter(([, value]) => finite(value)));
        if (Object.keys(axes).length !== Object.keys(unit.domainAxes).length) { unit.domainAxes = axes; repair("ogiltiga domänaxelvärden borttagna"); }
      }
    }
    ids.add(raw.id);
    units.push(unit as unknown as FieldUnit);
    if (repaired) report.repairedNodes++;
  }
  if (!units.length) throw new Error(`Inga användbara noder kvar. ${report.skippedNodes} noder överhoppade. ${report.details.join("; ")}`);
  const grouped = new Map<number, FieldUnit[]>();
  for (const unit of units) {
    const members = grouped.get(unit.clusterId) ?? [];
    members.push(unit); grouped.set(unit.clusterId, members);
  }
  const average = (members: FieldUnit[], key: "fz" | "fy") => members.reduce((sum, u) => sum + u[key] / members.length, 0);
  const restoredClusters = [...new Set([...clusters.keys(), ...grouped.keys()])].flatMap(id => {
    const members = grouped.get(id) ?? [];
    const original = clusters.get(id);
    const valid = original && vector(original.center) && typeof original.label === "string" && [original.unitCount, original.avgFZ, original.avgFY].every(finite);
    if (valid && !report.skippedNodes) return [original];
    if (!members.length) return [];
    detail(`Kluster ${id}: sammanställning återställd från kvarvarande noder`);
    return [{ ...original, id, label: typeof original?.label === "string" ? original.label : `Kluster ${id}`,
      description: typeof original?.description === "string" ? original.description : "",
      center: vector(original?.center) ? original?.center : [0, 1].map(axis => members.reduce((sum, u) => sum + u.vector2d[axis] / members.length, 0)),
      unitCount: members.length, avgFZ: average(members, "fz"), avgFY: average(members, "fy") }];
  });
  let edges = field.edges;
  if (edges != null) {
    if (!Array.isArray(edges)) { edges = []; detail("Ogiltig förbindelselista borttagen"); }
    else {
      const retained = edges.filter(edge => record(edge) && typeof edge.source === "string" && typeof edge.target === "string" && ids.has(edge.source) && ids.has(edge.target) && !ambiguous.has(edge.source) && !ambiguous.has(edge.target) && finite(edge.similarity));
      report.removedEdges = edges.length - retained.length; edges = retained;
    }
  }
  const stats = { ...field.stats };
  if (report.skippedNodes || ![stats.totalUnits, stats.boundaryUnits, stats.avgFZ, stats.avgFY].every(finite)) {
    Object.assign(stats, { totalUnits: units.length, boundaryUnits: units.filter(u => u.fz > 0.65).length, avgFZ: average(units, "fz"), avgFY: average(units, "fy") });
    // Original source coverage remains provenance, not a claim about retained nodes.
    if (record(stats.analyzedOf)) stats.analyzedOf = { ...stats.analyzedOf, analyzed: units.length };
    detail("Fältstatistik uppdaterad för kvarvarande noder");
  }
  if (report.repairedNodes || report.skippedNodes || report.removedEdges || report.details.length) {
    const notes = Array.isArray(stats.notes) ? stats.notes.filter(n => typeof n === "string") : [];
    stats.notes = [...notes, fieldImportSummary(report), ...report.details];
    onRepair?.(report);
  }
  return { ...field, units, clusters: restoredClusters, stats, ...(edges != null ? { edges } : {}) } as unknown as GeometricField;
}