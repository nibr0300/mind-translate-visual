CREATE TABLE IF NOT EXISTS public.global_clusters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_document_id uuid REFERENCES public.documents(id) ON DELETE CASCADE,
  source_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  cluster_id integer NOT NULL,
  label text NOT NULL,
  description text,
  unit_count integer NOT NULL DEFAULT 0,
  avg_fz real,
  avg_fy real,
  avg_cti real,
  centroid_embedding vector(3072),
  cohesion real,
  separation real,
  noise_ratio real,
  contributed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_document_id, cluster_id)
);

CREATE INDEX IF NOT EXISTS global_clusters_source_doc_idx ON public.global_clusters(source_document_id);

GRANT SELECT ON public.global_clusters TO authenticated;
GRANT ALL ON public.global_clusters TO service_role;

ALTER TABLE public.global_clusters ENABLE ROW LEVEL SECURITY;

-- Authenticated users may read everything (the table holds no raw text or user identity).
CREATE POLICY "Anyone signed in can read global clusters"
  ON public.global_clusters FOR SELECT
  TO authenticated
  USING (true);
-- No INSERT/UPDATE/DELETE policies for clients — only service role writes.

-- Trigger: when a document is set share_to_global=true (or inserted true),
-- copy its clusters into global_clusters. When unset, remove them.
CREATE OR REPLACE FUNCTION public.sync_global_clusters()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.share_to_global IS TRUE
     AND (TG_OP = 'INSERT' OR OLD.share_to_global IS DISTINCT FROM TRUE) THEN
    INSERT INTO public.global_clusters
      (source_document_id, source_user_id, cluster_id, label, description,
       unit_count, avg_fz, avg_fy, avg_cti, centroid_embedding,
       cohesion, separation, noise_ratio)
    SELECT
      cs.document_id, NEW.user_id, cs.cluster_id,
      COALESCE(cs.custom_label, cs.label), cs.description,
      cs.unit_count, cs.avg_fz, cs.avg_fy, cs.avg_cti, cs.centroid_embedding,
      q.cohesion, q.separation, q.noise_ratio
    FROM public.clusters_summary cs
    LEFT JOIN public.corpus_cluster_quality() q
      ON q.cluster_summary_id = cs.id
    WHERE cs.document_id = NEW.id
    ON CONFLICT (source_document_id, cluster_id) DO UPDATE
      SET label = EXCLUDED.label,
          description = EXCLUDED.description,
          unit_count = EXCLUDED.unit_count,
          avg_fz = EXCLUDED.avg_fz,
          avg_fy = EXCLUDED.avg_fy,
          avg_cti = EXCLUDED.avg_cti,
          centroid_embedding = EXCLUDED.centroid_embedding,
          cohesion = EXCLUDED.cohesion,
          separation = EXCLUDED.separation,
          noise_ratio = EXCLUDED.noise_ratio,
          contributed_at = now();
  END IF;

  IF NEW.share_to_global IS DISTINCT FROM TRUE
     AND TG_OP = 'UPDATE'
     AND OLD.share_to_global IS TRUE THEN
    DELETE FROM public.global_clusters WHERE source_document_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS documents_sync_global_clusters ON public.documents;
CREATE TRIGGER documents_sync_global_clusters
  AFTER INSERT OR UPDATE OF share_to_global ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_global_clusters();

-- Cross-user friction search in the shared namespace.
CREATE OR REPLACE FUNCTION public.match_global_clusters(
  query_embedding vector,
  match_count integer DEFAULT 10,
  min_similarity real DEFAULT 0.3,
  min_cti real DEFAULT 0.0
)
RETURNS TABLE (
  id uuid,
  label text,
  description text,
  unit_count integer,
  avg_fz real,
  avg_fy real,
  avg_cti real,
  cohesion real,
  separation real,
  noise_ratio real,
  similarity real,
  contributed_at timestamptz
)
LANGUAGE sql STABLE SET search_path = public
AS $$
  SELECT
    gc.id, gc.label, gc.description, gc.unit_count,
    gc.avg_fz, gc.avg_fy, gc.avg_cti,
    gc.cohesion, gc.separation, gc.noise_ratio,
    (1 - (gc.centroid_embedding <=> query_embedding))::REAL AS similarity,
    gc.contributed_at
  FROM public.global_clusters gc
  WHERE gc.centroid_embedding IS NOT NULL
    AND COALESCE(gc.avg_cti, 0) >= min_cti
    AND (1 - (gc.centroid_embedding <=> query_embedding)) >= min_similarity
  ORDER BY gc.centroid_embedding <=> query_embedding
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION public.match_global_clusters(vector, integer, real, real) TO authenticated;