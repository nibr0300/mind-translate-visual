import type { FieldUnit } from "./fieldData";

export interface AxisPos { x: number; y: number; scored: boolean }

/**
 * Place units by two domain-axis scores (0..1) in percent of the canvas.
 * x: axis A low→high left→right. y: axis B low→high bottom→top.
 * Units lacking either score go to an "unscored" strip along the bottom edge.
 */
export function axisLayout(units: FieldUnit[], xKey: string, yKey: string): AxisPos[] {
  const unscored = units.filter((u) => !hasBoth(u, xKey, yKey)).length;
  let k = 0;
  return units.map((u) => {
    if (hasBoth(u, xKey, yKey)) {
      return { x: 8 + 84 * u.domainAxes![xKey], y: 88 - 80 * u.domainAxes![yKey], scored: true };
    }
    const x = 5 + (90 * (k + 0.5)) / Math.max(1, unscored);
    k++;
    return { x, y: 96, scored: false };
  });
}

function hasBoth(u: FieldUnit, a: string, b: string) {
  const v = u.domainAxes;
  return !!v && typeof v[a] === "number" && typeof v[b] === "number";
}
