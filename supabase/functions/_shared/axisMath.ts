/**
 * Domain-axis math shared by the browser and the field API (pure TS, no deps).
 *
 * Axis weight = eta² (between-cluster variance / total variance) of the units'
 * scores on that axis: 1 when clusters separate cleanly along the axis, 0 when
 * the axis says nothing about how the material is organised.
 */
export interface AxisUnit {
  clusterId: number;
  axes: Record<string, number>;
  tension: number; // 0..1, e.g. triangulated truth tension or CTI
}

export interface AxisWeight {
  key: string;
  weight: number;
  coverage: number; // share of units that carry a score on this axis
}

export interface AxisFriction {
  axis: string;
  magnitude: number; // gap between cluster means × mean tension of the pair
  gap: number;
  clusters: [number, number];
}

const round = (v: number) => Math.round(v * 1000) / 1000;

export function axisWeights(units: AxisUnit[], keys: string[]): AxisWeight[] {
  return keys.map((key) => {
    const scored = units.filter((u) => typeof u.axes?.[key] === "number");
    if (scored.length < 2) return { key, weight: 0, coverage: round(scored.length / Math.max(1, units.length)) };
    const values = scored.map((u) => u.axes[key]);
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const total = values.reduce((s, v) => s + (v - mean) ** 2, 0);
    const groups = new Map<number, number[]>();
    for (const u of scored) {
      if (!groups.has(u.clusterId)) groups.set(u.clusterId, []);
      groups.get(u.clusterId)!.push(u.axes[key]);
    }
    let between = 0;
    for (const g of groups.values()) {
      const m = g.reduce((s, v) => s + v, 0) / g.length;
      between += g.length * (m - mean) ** 2;
    }
    const weight = total > 1e-9 ? between / total : 0;
    return { key, weight: round(Math.min(1, Math.max(0, weight))), coverage: round(scored.length / units.length) };
  });
}

export function axisFrictions(units: AxisUnit[], keys: string[], topN = 10): AxisFriction[] {
  const stats = new Map<number, { n: number; tension: number; sums: Record<string, { s: number; n: number }> }>();
  for (const u of units) {
    if (!stats.has(u.clusterId)) stats.set(u.clusterId, { n: 0, tension: 0, sums: {} });
    const c = stats.get(u.clusterId)!;
    c.n++;
    c.tension += u.tension;
    for (const k of keys) {
      const v = u.axes?.[k];
      if (typeof v !== "number") continue;
      c.sums[k] ??= { s: 0, n: 0 };
      c.sums[k].s += v;
      c.sums[k].n++;
    }
  }
  const ids = [...stats.keys()].sort((a, b) => a - b);
  const out: AxisFriction[] = [];
  for (const k of keys) {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = stats.get(ids[i])!, b = stats.get(ids[j])!;
        if (!a.sums[k]?.n || !b.sums[k]?.n) continue;
        const gap = Math.abs(a.sums[k].s / a.sums[k].n - b.sums[k].s / b.sums[k].n);
        const tension = (a.tension / a.n + b.tension / b.n) / 2;
        out.push({ axis: k, gap: round(gap), magnitude: round(gap * tension), clusters: [ids[i], ids[j]] });
      }
    }
  }
  return out.sort((x, y) => y.magnitude - x.magnitude).slice(0, topN);
}
