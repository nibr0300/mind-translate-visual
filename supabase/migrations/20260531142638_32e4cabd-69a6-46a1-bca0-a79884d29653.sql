-- 2a. Ownership + sharing flag on documents
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS share_to_global boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS documents_user_id_idx ON public.documents(user_id);

-- 2b. Security-definer helper: does the current user own this document?
CREATE OR REPLACE FUNCTION public.user_owns_document(_doc_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.documents
    WHERE id = _doc_id AND user_id = auth.uid()
  );
$$;

-- 2c. Claim orphan documents (one-shot per user)
CREATE OR REPLACE FUNCTION public.claim_orphan_documents()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated';
  END IF;
  UPDATE public.documents
    SET user_id = auth.uid()
    WHERE user_id IS NULL;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_orphan_documents() TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_owns_document(uuid) TO authenticated, anon;

-- 2d. Rewrite RLS on documents/chunks/clusters_summary
DROP POLICY IF EXISTS "documents readable by everyone (demo)" ON public.documents;
DROP POLICY IF EXISTS "chunks readable by everyone (demo)" ON public.chunks;
DROP POLICY IF EXISTS "clusters_summary readable by everyone (demo)" ON public.clusters_summary;

CREATE POLICY "Users read own documents"
  ON public.documents FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Users insert own documents"
  ON public.documents FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own documents"
  ON public.documents FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users delete own documents"
  ON public.documents FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users read own chunks"
  ON public.chunks FOR SELECT
  TO authenticated
  USING (public.user_owns_document(document_id) OR (
    SELECT user_id IS NULL FROM public.documents WHERE id = chunks.document_id
  ));

CREATE POLICY "Users read own clusters"
  ON public.clusters_summary FOR SELECT
  TO authenticated
  USING (public.user_owns_document(document_id) OR (
    SELECT user_id IS NULL FROM public.documents WHERE id = clusters_summary.document_id
  ));

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT SELECT ON public.chunks TO authenticated;
GRANT SELECT ON public.clusters_summary TO authenticated;
-- Strip anon access
REVOKE SELECT ON public.documents FROM anon;
REVOKE SELECT ON public.chunks FROM anon;
REVOKE SELECT ON public.clusters_summary FROM anon;

-- 2e. API keys table for MCP
CREATE TABLE IF NOT EXISTS public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  key_prefix text NOT NULL,
  scopes text[] NOT NULL DEFAULT ARRAY['read']::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS api_keys_user_id_idx ON public.api_keys(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_keys TO authenticated;
GRANT ALL ON public.api_keys TO service_role;

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own api keys"
  ON public.api_keys FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users insert own api keys"
  ON public.api_keys FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own api keys"
  ON public.api_keys FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users delete own api keys"
  ON public.api_keys FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());