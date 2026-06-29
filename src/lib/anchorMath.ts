import type { FieldUnit } from "./fieldData";

/**
 * 5D intention vector: [FZ, FY, moralTension, narrativeTension, denialMarker].
 * Used as the "frame" axis when the user rotates the field around a chosen anchor.
 * Falls back to 0 for missing dimensions so older fields still work.
 */
export function unitIntentionVector(u: FieldUnit): [number, number, number, number, number] {
  return [
    u.fz ?? 0,
    u.fy ?? 0,
    u.intention?.moralTension ?? 0,
    u.intention?.narrativeTension ?? 0,
    u.intention?.denialMarker ?? 0,
  ];
}

/** Euclidean distance in 5D intention space, normalized to [0,1] (max dist = √5). */
export function distanceFromAnchor(anchor: FieldUnit, other: FieldUnit): number {
  const a = unitIntentionVector(anchor);
  const b = unitIntentionVector(other);
  let s = 0;
  for (let i = 0; i < 5; i++) s += (a[i] - b[i]) ** 2;
  return Math.min(1, Math.sqrt(s) / Math.sqrt(5));
}
