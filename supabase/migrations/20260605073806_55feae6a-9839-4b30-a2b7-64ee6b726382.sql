
CREATE OR REPLACE FUNCTION public.user_document_cti_ranking(limit_count INT DEFAULT 50)
RETURNS TABLE (
  id UUID,
  filename TEXT,
  source_type TEXT,
  uploaded_at TIMESTAMPTZ,
  avg_cti REAL,
  max_cti REAL,
  avg_fz REAL,
  avg_fy REAL,
  chunk_count INT,
  cluster_count INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, r.filename, r.source_type, r.uploaded_at,
         r.avg_cti, r.max_cti, r.avg_fz, r.avg_fy,
         r.chunk_count, r.cluster_count
  FROM public.document_cti_ranking r
  JOIN public.documents d ON d.id = r.id
  WHERE d.user_id = auth.uid()
  ORDER BY r.avg_cti DESC
  LIMIT GREATEST(limit_count, 1);
$$;

REVOKE ALL ON FUNCTION public.user_document_cti_ranking(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_document_cti_ranking(INT) TO authenticated;
