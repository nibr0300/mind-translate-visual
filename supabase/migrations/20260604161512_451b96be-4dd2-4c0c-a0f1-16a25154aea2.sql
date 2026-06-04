
-- 1. Chunks: add write policies
CREATE POLICY "Users insert own chunks" ON public.chunks
  FOR INSERT TO authenticated
  WITH CHECK (public.user_owns_document(document_id));

CREATE POLICY "Users update own chunks" ON public.chunks
  FOR UPDATE TO authenticated
  USING (public.user_owns_document(document_id))
  WITH CHECK (public.user_owns_document(document_id));

CREATE POLICY "Users delete own chunks" ON public.chunks
  FOR DELETE TO authenticated
  USING (public.user_owns_document(document_id));

-- 2. Clusters summary: add write policies
CREATE POLICY "Users insert own clusters" ON public.clusters_summary
  FOR INSERT TO authenticated
  WITH CHECK (public.user_owns_document(document_id));

CREATE POLICY "Users update own clusters" ON public.clusters_summary
  FOR UPDATE TO authenticated
  USING (public.user_owns_document(document_id))
  WITH CHECK (public.user_owns_document(document_id));

CREATE POLICY "Users delete own clusters" ON public.clusters_summary
  FOR DELETE TO authenticated
  USING (public.user_owns_document(document_id));

-- 3. Global clusters: explicit deny for client writes
-- (no INSERT/UPDATE/DELETE policy = denied for non-service-role; trigger uses SECURITY DEFINER)
-- Add an explicit restrictive policy for clarity & defense-in-depth:
CREATE POLICY "No client writes to global clusters insert" ON public.global_clusters
  AS RESTRICTIVE FOR INSERT TO authenticated, anon WITH CHECK (false);
CREATE POLICY "No client writes to global clusters update" ON public.global_clusters
  AS RESTRICTIVE FOR UPDATE TO authenticated, anon USING (false);
CREATE POLICY "No client writes to global clusters delete" ON public.global_clusters
  AS RESTRICTIVE FOR DELETE TO authenticated, anon USING (false);

-- 4. Remove NULL user_id read fallback on documents
DROP POLICY IF EXISTS "Users read own documents" ON public.documents;
CREATE POLICY "Users read own documents" ON public.documents
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 5. Remove NULL fallback on chunks/clusters_summary SELECT
DROP POLICY IF EXISTS "Users read own chunks" ON public.chunks;
CREATE POLICY "Users read own chunks" ON public.chunks
  FOR SELECT TO authenticated
  USING (public.user_owns_document(document_id));

DROP POLICY IF EXISTS "Users read own clusters" ON public.clusters_summary;
CREATE POLICY "Users read own clusters" ON public.clusters_summary
  FOR SELECT TO authenticated
  USING (public.user_owns_document(document_id));

-- 6. Revoke EXECUTE on internal SECURITY DEFINER helpers from anon/authenticated.
-- These are either called by RLS (run as owner regardless) or by edge functions via service role.
REVOKE EXECUTE ON FUNCTION public.user_owns_document(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_document_cti_ranking() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_global_clusters() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_owns_document(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_document_cti_ranking() TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_global_clusters() TO service_role;
-- claim_orphan_documents is now obsolete (no NULL user_id access path); revoke and drop callers later
REVOKE EXECUTE ON FUNCTION public.claim_orphan_documents() FROM PUBLIC, anon, authenticated;

-- 7. Hide materialized view from the Data API
REVOKE SELECT ON public.document_cti_ranking FROM anon, authenticated;
