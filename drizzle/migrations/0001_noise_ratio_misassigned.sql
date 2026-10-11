UPDATE public.clusters_summary cs
SET noise_ratio = q.nr
FROM (
  SELECT own.id,
    (SUM(CASE WHEN EXISTS (
        SELECT 1 FROM public.clusters_summary o
        WHERE o.document_id = own.document_id AND o.id <> own.id AND o.centroid_embedding IS NOT NULL
          AND (c.embedding <=> o.centroid_embedding) < (c.embedding <=> own.centroid_embedding)
      ) THEN 1 ELSE 0 END)::real / NULLIF(COUNT(*),0))::real AS nr
  FROM public.clusters_summary own
  JOIN public.chunks c ON c.document_id = own.document_id AND c.cluster_id = own.cluster_id
  WHERE own.centroid_embedding IS NOT NULL AND c.embedding IS NOT NULL
  GROUP BY own.id
) q
WHERE q.id = cs.id;