import { supabase } from "@/integrations/supabase/client";
import { finiteMetric } from "./metricDisplay";

export interface CorpusDocument {
  id: string;
  filename: string;
  source_type: string;
  uploaded_at: string;
  avg_cti: number | null;
  max_cti: number | null;
  avg_fz: number | null;
  avg_fy: number | null;
  chunk_count: number;
  cluster_count: number;
}

export interface ClusterMatch {
  id: string;
  cluster_id: number;
  document_id: string;
  filename: string;
  label: string;
  custom_label: string | null;
  similarity: number | null;
  fz_delta: number | null;
  fy_delta: number | null;
  hybrid_score: number | null;
  avg_fz: number | null;
  avg_fy: number | null;
  avg_cti: number | null;
  unit_count: number;
  description: string;
}

export interface ChunkMatch {
  id: string;
  document_id: string;
  text: string;
  source_path: string | null;
  cluster_label: string | null;
  fz: number | null;
  cti: number | null;
  similarity: number | null;
  filename: string | null;
}

const CACHE_TTL = 5 * 60 * 1000;

interface CacheEntry<T> { v: T; t: number }
const memCache = new Map<string, CacheEntry<unknown>>();

function getCache<T>(key: string): T | null {
  const e = memCache.get(key) as CacheEntry<T> | undefined;
  if (!e) return null;
  if (Date.now() - e.t > CACHE_TTL) { memCache.delete(key); return null; }
  return e.v;
}
function setCache<T>(key: string, v: T) { memCache.set(key, { v, t: Date.now() }); }

export async function fetchCorpusRanking(force = false): Promise<CorpusDocument[]> {
  if (!force) {
    const cached = getCache<CorpusDocument[]>("corpus-ranking");
    if (cached) return cached;
  }
  const { data, error } = await supabase.rpc("user_document_cti_ranking" as any, { limit_count: 50 });
  if (error) {
    console.warn("[searchClient] corpus ranking failed:", error.message);
    return [];
  }
  const rows = ((data ?? []) as unknown as CorpusDocument[]).map(row => ({
    ...row, avg_cti: finiteMetric(row.avg_cti), max_cti: finiteMetric(row.max_cti),
    avg_fz: finiteMetric(row.avg_fz), avg_fy: finiteMetric(row.avg_fy),
  }));
  setCache("corpus-ranking", rows);
  return rows;
}

export interface SearchClustersOpts {
  documentId: string;
  clusterId: number;
  fzFyWeight?: number;
  minSimilarity?: number;
  matchCount?: number;
}

export async function searchSimilarClusters(opts: SearchClustersOpts): Promise<{
  source: { label: string; avg_fz: number | null; avg_fy: number } | null;
  matches: ClusterMatch[];
}> {
  const { data, error } = await supabase.functions.invoke("search-clusters", {
    body: {
      document_id: opts.documentId,
      cluster_id: opts.clusterId,
      fz_fy_weight: opts.fzFyWeight ?? 0.3,
      min_similarity: opts.minSimilarity ?? 0.0,
      match_count: opts.matchCount ?? 10,
    },
  });
  if (error) throw error;
  const result = data as { source: any; matches?: ClusterMatch[] };
  return { ...result, matches: (result.matches ?? []).map(row => ({
    ...row, similarity: finiteMetric(row.similarity), hybrid_score: finiteMetric(row.hybrid_score),
    fz_delta: finiteMetric(row.fz_delta), fy_delta: finiteMetric(row.fy_delta),
    avg_fz: finiteMetric(row.avg_fz), avg_fy: finiteMetric(row.avg_fy), avg_cti: finiteMetric(row.avg_cti),
  })) };
}

export async function searchChunks(
  query: string,
  opts: { minCti?: number; minSimilarity?: number; matchCount?: number } = {},
): Promise<ChunkMatch[]> {
  const { data, error } = await supabase.functions.invoke("search-chunks", {
    body: {
      query,
      min_cti: opts.minCti ?? 0,
      min_similarity: opts.minSimilarity ?? 0.3,
      match_count: opts.matchCount ?? 12,
    },
  });
  if (error) throw error;
  return (((data as any)?.matches ?? []) as ChunkMatch[]).map(row => ({
    ...row, similarity: finiteMetric(row.similarity), fz: finiteMetric(row.fz), cti: finiteMetric(row.cti),
  }));
}

export async function updateClusterLabel(
  documentId: string,
  clusterId: number,
  customLabel: string | null,
): Promise<void> {
  const { error } = await supabase.functions.invoke("update-cluster-label", {
    body: { document_id: documentId, cluster_id: clusterId, custom_label: customLabel },
  });
  if (error) throw error;
  memCache.delete("corpus-ranking");
}

export function invalidateCorpusCache() {
  memCache.delete("corpus-ranking");
}
