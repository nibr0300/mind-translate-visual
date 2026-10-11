ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS domain text NOT NULL DEFAULT 'general';
UPDATE public.documents SET domain = COALESCE(NULLIF(stats->>'domain',''), 'general');
CREATE INDEX IF NOT EXISTS documents_user_domain_idx ON public.documents(user_id, domain);

ALTER TABLE public.clusters_summary ADD COLUMN IF NOT EXISTS cohesion real;
ALTER TABLE public.clusters_summary ADD COLUMN IF NOT EXISTS noise_ratio real;

UPDATE public.clusters_summary cs
SET cohesion = q.coh, noise_ratio = q.nr
FROM (
  SELECT cs2.id,
         AVG(1 - (c.embedding <=> cs2.centroid_embedding))::real AS coh,
         (SUM(CASE WHEN (1 - (c.embedding <=> cs2.centroid_embedding)) < 0.5 THEN 1 ELSE 0 END)::real / NULLIF(COUNT(*),0))::real AS nr
  FROM public.clusters_summary cs2
  JOIN public.chunks c ON c.document_id = cs2.document_id AND c.cluster_id = cs2.cluster_id
  WHERE cs2.centroid_embedding IS NOT NULL AND c.embedding IS NOT NULL
  GROUP BY cs2.id
) q
WHERE q.id = cs.id;