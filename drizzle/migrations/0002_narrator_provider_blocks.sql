CREATE TABLE public.narrator_provider_blocks (model text PRIMARY KEY, status integer NOT NULL, message text NOT NULL, blocked_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.narrator_provider_blocks TO service_role;
ALTER TABLE public.narrator_provider_blocks ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.narrator_provider_blocks IS 'Server-only persistent provider access denials; no client access and no corpus or training data.';