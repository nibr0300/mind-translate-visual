-- Document-level dedup + cross-cluster edges support
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS content_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS documents_content_hash_uidx
  ON public.documents(content_hash)
  WHERE content_hash IS NOT NULL;

-- Function: corpus topology with edges between cluster centroids.
-- Returns edges where cosine similarity >= min_similarity, capped at max_edges.
CREATE OR REPLACE FUNCTION public.corpus_cluster_edges(
  min_similarity REAL DEFAULT 0.55,
  max_edges INT DEFAULT 500
)
RETURNS TABLE(
  src_id UUID,
  dst_id UUID,
  src_doc UUID,
  dst_doc UUID,
  src_cluster INT,
  dst_cluster INT,
  src_label TEXT,
  dst_label TEXT,
  similarity REAL,
  fz_delta REAL,
  fy_delta REAL,
  hybrid REAL
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    a.id          AS src_id,
    b.id          AS dst_id,
    a.document_id AS src_doc,
    b.document_id AS dst_doc,
    a.cluster_id  AS src_cluster,
    b.cluster_id  AS dst_cluster,
    COALESCE(a.custom_label, a.label) AS src_label,
    COALESCE(b.custom_label, b.label) AS dst_label,
    (1 - (a.centroid_embedding <=> b.centroid_embedding))::REAL AS similarity,
    ABS(COALESCE(a.avg_fz,0) - COALESCE(b.avg_fz,0))::REAL      AS fz_delta,
    ABS(COALESCE(a.avg_fy,0) - COALESCE(b.avg_fy,0))::REAL      AS fy_delta,
    (
      0.7 * (1 - (a.centroid_embedding <=> b.centroid_embedding))
      + 0.3 * (1 - LEAST(
          ABS(COALESCE(a.avg_fz,0) - COALESCE(b.avg_fz,0))
          + ABS(COALESCE(a.avg_fy,0) - COALESCE(b.avg_fy,0)), 1))
    )::REAL AS hybrid
  FROM public.clusters_summary a
  JOIN public.clusters_summary b
    ON a.id < b.id
   AND a.centroid_embedding IS NOT NULL
   AND b.centroid_embedding IS NOT NULL
  WHERE (1 - (a.centroid_embedding <=> b.centroid_embedding)) >= min_similarity
  ORDER BY hybrid DESC
  LIMIT max_edges;
$$;

GRANT EXECUTE ON FUNCTION public.corpus_cluster_edges(REAL, INT) TO anon, authenticated, service_role;
