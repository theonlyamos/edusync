-- One webhook per embed API key: where to send session events and the secret
-- that signs them. Server-only, because the secret must not be readable
-- through the browser's own database access.
CREATE TABLE IF NOT EXISTS public.embed_webhooks (
  api_key_id uuid PRIMARY KEY REFERENCES public.embed_api_keys(id) ON DELETE CASCADE,
  url text NOT NULL CHECK (char_length(url) BETWEEN 12 AND 500 AND url LIKE 'https://%'),
  secret text NOT NULL CHECK (char_length(secret) >= 32),
  last_delivery_at timestamptz,
  last_status integer,
  last_error text CHECK (last_error IS NULL OR char_length(last_error) <= 300),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.embed_webhooks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.embed_webhooks FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.embed_webhooks TO service_role;
