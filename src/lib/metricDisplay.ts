/** Missing measurements remain missing; never turn them into measured zero. */
export function finiteMetric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function formatMetric(value: unknown, digits = 2): string {
  const metric = finiteMetric(value);
  return metric === null ? "—" : metric.toFixed(digits);
}

export function metricBarWidth(value: unknown, multiplier = 200): string {
  const metric = finiteMetric(value);
  return `${metric === null ? 0 : Math.max(0, Math.min(100, metric * multiplier))}%`;
}