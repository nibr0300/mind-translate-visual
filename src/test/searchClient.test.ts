import { beforeEach, describe, expect, it, vi } from "vitest";
import { finiteMetric, formatMetric, metricBarWidth } from "@/lib/metricDisplay";

const client = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: client.rpc, functions: { invoke: client.invoke } } }));
import { fetchCorpusRanking, invalidateCorpusCache, searchChunks, searchSimilarClusters } from "@/lib/searchClient";

beforeEach(() => { vi.resetAllMocks(); invalidateCorpusCache(); });

describe("unavailable search measurements", () => {
  it("preserves zero but rejects null, undefined, non-finite and nonnumeric scores", () => {
    expect(finiteMetric(0)).toBe(0);
    for (const value of [null, undefined, NaN, Infinity, "0.4"]) expect(finiteMetric(value)).toBeNull();
    expect(finiteMetric(0.63)).toBe(0.63);
    expect(formatMetric(null)).toBe("—");
    expect(formatMetric(0)).toBe("0.00");
    expect(formatMetric(0.63)).toBe("0.63");
    expect(metricBarWidth(null)).toBe("0%");
    expect(metricBarWidth(0.3)).toBe("60%");
    expect(metricBarWidth(0.8)).toBe("100%");
  });

  it("retains corpus documents without inventing unavailable CTI or F-values", async () => {
    client.rpc.mockResolvedValue({ data: [{ id: "missing", avg_cti: null, max_cti: NaN, avg_fz: undefined, avg_fy: 0 }], error: null });
    const rows = await fetchCorpusRanking();
    expect(rows).toEqual([{ id: "missing", avg_cti: null, max_cti: null, avg_fz: null, avg_fy: 0 }]);
    expect(await fetchCorpusRanking()).toEqual(rows);
    expect(client.rpc).toHaveBeenCalledTimes(1);
  });

  it("normalizes every nullable cluster score without dropping the result", async () => {
    client.invoke.mockResolvedValue({ data: { source: null, matches: [{ id: "cluster", hybrid_score: null, similarity: undefined, fz_delta: Infinity, fy_delta: null, avg_fz: null, avg_fy: 0, avg_cti: 0.4 }] }, error: null });
    expect((await searchSimilarClusters({ documentId: "doc", clusterId: 1 })).matches).toEqual([
      { id: "cluster", hybrid_score: null, similarity: null, fz_delta: null, fy_delta: null, avg_fz: null, avg_fy: 0, avg_cti: 0.4 },
    ]);
  });

  it("normalizes missing chunk scores while preserving valid measurements", async () => {
    client.invoke.mockResolvedValue({ data: { matches: [{ id: "chunk", similarity: null, fz: undefined, cti: 0.2 }] }, error: null });
    expect(await searchChunks("relation")).toEqual([{ id: "chunk", similarity: null, fz: null, cti: 0.2 }]);
  });
});