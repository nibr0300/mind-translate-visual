ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS file_size bigint;

-- Remove duplicate uploads of the same file, keeping the most recent one
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY user_id, filename ORDER BY uploaded_at DESC) AS rn
  FROM public.documents
)
DELETE FROM public.documents d
USING ranked r
WHERE d.id = r.id AND r.rn > 1;

REFRESH MATERIALIZED VIEW public.document_cti_ranking;