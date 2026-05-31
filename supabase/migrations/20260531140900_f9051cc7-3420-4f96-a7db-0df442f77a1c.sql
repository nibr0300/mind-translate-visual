CREATE OR REPLACE FUNCTION public.corpus_cluster_quality(noise_threshold real DEFAULT 0.5)
RETURNS TABLE(
  cluster_summary_id uuid,
  document_id uuid,
  cluster_id integer,
  cohesion real,
  separation real,
  noise_ratio real,
  member_count integer
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  WITH chunk_sim AS (
    SELECT
      cs.id AS cluster_summary_id,
      cs.document_id,
      cs.cluster_id,
      (1 - (c.embedding <=> cs.centroid_embedding))::REAL AS sim
    FROM public.clusters_summary cs
    JOIN public.chunks c
      ON c.document_id = cs.document_id
     AND c.cluster_id  = cs.cluster_id
    WHERE cs.centroid_embedding IS NOT NULL
      AND c.embedding IS NOT NULL
  ),
  coh AS (
    SELECT
      cluster_summary_id,
      document_id,
      cluster_id,
      AVG(sim)::REAL                                                AS cohesion,
      (SUM(CASE WHEN sim < noise_threshold THEN 1 ELSE 0 END)::REAL
        / NULLIF(COUNT(*), 0))                                      AS noise_ratio,
      COUNT(*)::INT                                                 AS member_count
    FROM chunk_sim
    GROUP BY cluster_summary_id, document_id, cluster_id
  ),
  sep AS (
    SELECT
      a.id AS cluster_summary_id,
      MIN(a.centroid_embedding <=> b.centroid_embedding)::REAL AS nearest_distance
    FROM public.clusters_summary a
    JOIN public.clusters_summary b
      ON a.id <> b.id
     AND a.centroid_embedding IS NOT NULL
     AND b.centroid_embedding IS NOT NULL
    GROUP BY a.id
  )
  SELECT
    coh.cluster_summary_id,
    coh.document_id,
    coh.cluster_id,
    coh.cohesion,
    COALESCE(sep.nearest_distance, 1.0)::REAL AS separation,
    coh.noise_ratio,
    coh.member_count
  FROM coh
  LEFT JOIN sep ON sep.cluster_summary_id = coh.cluster_summary_id;
$$;