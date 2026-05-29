-- Enable pgvector for similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- =====================================================================
-- DOCUMENTS: one row per uploaded source (pdf, zip, audio, image, ...)
-- =====================================================================
CREATE TABLE public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('pdf','text','script','image','audio','zip','json')),
  embedding_model TEXT NOT NULL DEFAULT 'openai/text-embedding-3-small',
  embedding_dim INT NOT NULL DEFAULT 1536,
  stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.documents TO anon, authenticated;
GRANT ALL    ON public.documents TO service_role;

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "documents readable by everyone (demo)"
  ON public.documents FOR SELECT TO anon, authenticated USING (true);

-- Writes are only allowed via service_role (edge functions). No INSERT policy.

-- =====================================================================
-- CHUNKS: one row per (overlapping) text chunk, with embedding + field metadata
-- =====================================================================
CREATE TABLE public.chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  text TEXT NOT NULL,
  content_hash TEXT NOT NULL,             -- sha-256 of normalized text, for dedup
  source_path TEXT,                       -- e.g. "src/app.ts" inside a zip
  cluster_id INT,
  cluster_label TEXT,
  fz REAL,
  fy REAL,
  cti REAL,
  triangulation JSONB,
  intention JSONB,
  embedding vector(1536),                 -- nullable until embed step succeeds
  embedding_dim INT NOT NULL DEFAULT 1536,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id, chunk_index),
  UNIQUE (document_id, content_hash)
);

GRANT SELECT ON public.chunks TO anon, authenticated;
GRANT ALL    ON public.chunks TO service_role;

ALTER TABLE public.chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chunks readable by everyone (demo)"
  ON public.chunks FOR SELECT TO anon, authenticated USING (true);

-- HNSW cosine index — only built once data is present, but safe to declare now.
CREATE INDEX chunks_embedding_hnsw ON public.chunks
  USING hnsw (embedding vector_cosine_ops);

CREATE INDEX chunks_document_id_idx ON public.chunks (document_id);
CREATE INDEX chunks_cti_idx ON public.chunks (cti DESC NULLS LAST);

-- =====================================================================
-- CLUSTERS_SUMMARY: per-document cluster centroids for friction similarity
-- =====================================================================
CREATE TABLE public.clusters_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  cluster_id INT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  unit_count INT NOT NULL DEFAULT 0,
  avg_fz REAL,
  avg_fy REAL,
  avg_cti REAL,
  centroid_embedding vector(1536),
  embedding_dim INT NOT NULL DEFAULT 1536,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id, cluster_id)
);

GRANT SELECT ON public.clusters_summary TO anon, authenticated;
GRANT ALL    ON public.clusters_summary TO service_role;

ALTER TABLE public.clusters_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clusters_summary readable by everyone (demo)"
  ON public.clusters_summary FOR SELECT TO anon, authenticated USING (true);

CREATE INDEX clusters_summary_centroid_hnsw ON public.clusters_summary
  USING hnsw (centroid_embedding vector_cosine_ops);

-- =====================================================================
-- SEARCH FUNCTIONS
-- =====================================================================

-- Semantic chunk search with optional CTI floor
CREATE OR REPLACE FUNCTION public.match_chunks(
  query_embedding vector(1536),
  match_count INT DEFAULT 10,
  min_similarity REAL DEFAULT 0.0,
  min_cti REAL DEFAULT 0.0
)
RETURNS TABLE (
  id UUID,
  document_id UUID,
  text TEXT,
  source_path TEXT,
  cluster_label TEXT,
  fz REAL,
  cti REAL,
  similarity REAL
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT
    c.id,
    c.document_id,
    c.text,
    c.source_path,
    c.cluster_label,
    c.fz,
    c.cti,
    (1 - (c.embedding <=> query_embedding))::REAL AS similarity
  FROM public.chunks c
  WHERE c.embedding IS NOT NULL
    AND COALESCE(c.cti, 0) >= min_cti
    AND (1 - (c.embedding <=> query_embedding)) >= min_similarity
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Friction-cluster similarity (find similar tension patterns across documents)
CREATE OR REPLACE FUNCTION public.match_clusters(
  query_embedding vector(1536),
  match_count INT DEFAULT 8,
  min_similarity REAL DEFAULT 0.0,
  exclude_document_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  document_id UUID,
  cluster_id INT,
  label TEXT,
  description TEXT,
  unit_count INT,
  avg_fz REAL,
  avg_cti REAL,
  similarity REAL
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT
    cs.id,
    cs.document_id,
    cs.cluster_id,
    cs.label,
    cs.description,
    cs.unit_count,
    cs.avg_fz,
    cs.avg_cti,
    (1 - (cs.centroid_embedding <=> query_embedding))::REAL AS similarity
  FROM public.clusters_summary cs
  WHERE cs.centroid_embedding IS NOT NULL
    AND (exclude_document_id IS NULL OR cs.document_id <> exclude_document_id)
    AND (1 - (cs.centroid_embedding <=> query_embedding)) >= min_similarity
  ORDER BY cs.centroid_embedding <=> query_embedding
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION public.match_chunks   TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.match_clusters TO anon, authenticated, service_role;