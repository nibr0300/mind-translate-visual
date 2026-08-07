import type { FieldUnit } from "./fieldData";
import { unitIntentionVector } from "./anchorMath";

/**
 * The helm ("skeppets ratt") turns the field around an axis through intention space.
 *
 * The 5D intention vector [FZ, FY, moral, narrativ, denial] is projected onto a
 * heading direction h(θ) that sweeps a plane spanned by two orthogonal basis axes:
 *
 *   A = tension  ↔ resonance      (FZ vs FY)
 *   B = moral+narrativ ↔ förnekelse
 *
 * The scalar projection becomes the node's *depth*: positive = närmare betraktaren,
 * negative = längre bort. Turning the wheel changes which semantic direction is
 * "framåt", which pulls stacked nodes apart in depth instead of leaving them piled.
 */

const SQRT2 = Math.SQRT2;
const SQRT3 = Math.sqrt(3);

const AXIS_A: [number, number, number, number, number] = [1 / SQRT2, -1 / SQRT2, 0, 0, 0];
const AXIS_B: [number, number, number, number, number] = [0, 0, 1 / SQRT3, 1 / SQRT3, -1 / SQRT3];

/** Unit heading vector in 5D intention space for a wheel angle (radians). */
export function headingVector(theta: number): [number, number, number, number, number] {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return [
    AXIS_A[0] * c + AXIS_B[0] * s,
    AXIS_A[1] * c + AXIS_B[1] * s,
    AXIS_A[2] * c + AXIS_B[2] * s,
    AXIS_A[3] * c + AXIS_B[3] * s,
    AXIS_A[4] * c + AXIS_B[4] * s,
  ];
}

/** Human-readable name of the direction the bow points in. */
export function headingLabel(theta: number): string {
  const deg = ((theta * 180) / Math.PI + 360) % 360;
  const sectors: [number, string][] = [
    [22.5, "Spänning (FZ)"],
    [67.5, "Spänning · Moral"],
    [112.5, "Moral & narrativ"],
    [157.5, "Moral · Resonans"],
    [202.5, "Resonans (FY)"],
    [247.5, "Resonans · Förnekelse"],
    [292.5, "Förnekelse"],
    [337.5, "Förnekelse · Spänning"],
  ];
  for (const [limit, label] of sectors) if (deg < limit) return label;
  return "Spänning (FZ)";
}

/**
 * Depth per unit, normalized to roughly [-1, 1] across the field.
 * Returns an empty array for an empty field.
 */
export function computeDepths(units: FieldUnit[], theta: number): number[] {
  if (units.length === 0) return [];
  const h = headingVector(theta);
  const raw = units.map((u) => {
    const v = unitIntentionVector(u);
    let s = 0;
    for (let i = 0; i < 5; i++) s += v[i] * h[i];
    return s;
  });
  const mean = raw.reduce((a, b) => a + b, 0) / raw.length;
  const centered = raw.map((r) => r - mean);
  const max = Math.max(...centered.map((c) => Math.abs(c)), 1e-6);
  return centered.map((c) => c / max);
}

/**
 * Screen transform for a node given the wheel angle and its depth.
 * The plane itself rotates slightly (physical feel) and depth spreads nodes
 * radially so piles resolve into near/far layers.
 */
export function applyHelm(
  pos: { x: number; y: number },
  depth: number,
  theta: number,
  amount = 1
): { x: number; y: number } {
  const planeRot = theta * 0.35 * amount;
  const cx = 50;
  const cy = 50;
  const dx = pos.x - cx;
  const dy = pos.y - cy;
  const c = Math.cos(planeRot);
  const s = Math.sin(planeRot);
  const rx = dx * c - dy * s;
  const ry = dx * s + dy * c;
  const spread = 1 + depth * 0.18 * amount;
  return {
    x: Math.max(3, Math.min(97, cx + rx * spread)),
    y: Math.max(3, Math.min(97, cy + ry * spread)),
  };
}
