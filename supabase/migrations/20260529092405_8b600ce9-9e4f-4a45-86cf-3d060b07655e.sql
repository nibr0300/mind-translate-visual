-- Custom labels on clusters_summary
ALTER TABLE public.clusters_summary
  ADD COLUMN IF NOT EXISTS custom_label TEXT,
  ADD COLUMN IF NOT EXISTS custom_label_updated_at TIMESTAMPTZ;

-- Materialized view for per-document CTI ranking
DROP MATERIALIZED VIEW IF EXISTS public.document_cti_ranking;
CREATE MATERIALIZED VIEW public.document_cti_ranking AS
SELECT
  d.id,
  d.filename,
  d.source_type,
  d.uploaded_at,
  COALESCE(AVG(c.cti), 0)::REAL          AS avg_cti,
  COALESCE(MAX(c.cti), 0)::REAL          AS max_cti,
  COALESCE(AVG(c.fz), 0)::REAL           AS avg_fz,
  COALESCE(AVG(c.fy), 0)::REAL           AS avg_fy,
  COUNT(c.id)::INT                       AS chunk_count,
  COUNT(DISTINCT c.cluster_id)::INT      AS cluster_count
FROM public.documents d
LEFT JOIN public.chunks c ON c.document_id = d.id
GROUP BY d.id, d.filename, d.source_type, d.uploaded_at;

CREATE UNIQUE INDEX IF NOT EXISTS document_cti_ranking_id_idx
  ON public.document_cti_ranking (id);
CREATE INDEX IF NOT EXISTS document_cti_ranking_avg_cti_idx
  ON public.document_cti_ranking (avg_cti DESC);

GRANT SELECT ON public.document_cti_ranking TO anon, authenticated;
GRANT ALL ON public.document_cti_ranking TO service_role;

-- Hybrid cluster similarity function
CREATE OR REPLACE FUNCTION public.match_clusters_hybrid(
  query_embedding vector,
  query_fz        REAL,
  query_fy        REAL,
  match_count     INT     DEFAULT 10,
  exclude_doc_id  UUID    DEFAULT NULL,
  min_similarity  REAL    DEFAULT 0.0,
  fz_fy_weight    REAL    DEFAULT 0.3
)
RETURNS TABLE (
  id              UUID,
  cluster_id      INT,
  document_id     UUID,
  filename        TEXT,
  label           TEXT,
  custom_label    TEXT,
  similarity      REAL,
  fz_delta        REAL,
  fy_delta        REAL,
  hybrid_score    REAL,
  avg_fz          REAL,
  avg_fy          REAL,
  avg_cti         REAL,
  unit_count      INT,
  description     TEXT
)
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
  SELECT
    cs.id,
    cs.cluster_id,
    cs.document_id,
    d.filename,
    cs.label,
    cs.custom_label,
    (1 - (cs.centroid_embedding <=> query_embedding))::REAL                       AS similarity,
    ABS(COALESCE(cs.avg_fz, 0) - query_fz)::REAL                                  AS fz_delta,
    ABS(COALESCE(cs.avg_fy, 0) - query_fy)::REAL                                  AS fy_delta,
    (
      (1 - fz_fy_weight) * (1 - (cs.centroid_embedding <=> query_embedding))
      + fz_fy_weight * (1 - LEAST(
          ABS(COALESCE(cs.avg_fz, 0) - query_fz)
          + ABS(COALESCE(cs.avg_fy, 0) - query_fy), 1))
    )::REAL                                                                       AS hybrid_score,
    cs.avg_fz,
    cs.avg_fy,
    cs.avg_cti,
    cs.unit_count,
    LEFT(COALESCE(cs.description, ''), 240)                                       AS description
  FROM public.clusters_summary cs
  JOIN public.documents d ON d.id = cs.document_id
  WHERE cs.centroid_embedding IS NOT NULL
    AND (exclude_doc_id IS NULL OR cs.document_id <> exclude_doc_id)
    AND (1 - (cs.centroid_embedding <=> query_embedding)) >= min_similarity
  ORDER BY hybrid_score DESC
  LIMIT match_count;
$$;

-- Refresh helper callable by service_role
CREATE OR REPLACE FUNCTION public.refresh_document_cti_ranking()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW public.document_cti_ranking;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_document_cti_ranking() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_document_cti_ranking() TO service_role;