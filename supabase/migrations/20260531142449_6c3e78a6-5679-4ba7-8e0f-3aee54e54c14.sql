DROP INDEX IF EXISTS public.chunks_embedding_hnsw;
DROP INDEX IF EXISTS public.clusters_summary_centroid_hnsw;

ALTER TABLE public.chunks
  ALTER COLUMN embedding TYPE vector(3072) USING NULL,
  ALTER COLUMN embedding_dim SET DEFAULT 3072;

ALTER TABLE public.clusters_summary
  ALTER COLUMN centroid_embedding TYPE vector(3072) USING NULL,
  ALTER COLUMN embedding_dim SET DEFAULT 3072;

ALTER TABLE public.documents
  ALTER COLUMN embedding_dim SET DEFAULT 3072,
  ALTER COLUMN embedding_model SET DEFAULT 'google/gemini-embedding-001';

UPDATE public.chunks SET embedding_dim = 3072;
UPDATE public.clusters_summary SET embedding_dim = 3072;

-- No ANN index: pgvector HNSW maxes at 2000 dims, IVFFlat at 2000 as well.
-- Exact cosine scan is fine for current corpus size; revisit if needed.

SELECT public.refresh_document_cti_ranking();