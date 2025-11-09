-- Embed API Keys Table
-- Allows developers to create API keys for embedding sessions on their platforms
-- Credits are deducted from the API key owner's account

CREATE TABLE IF NOT EXISTS public.embed_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Owner of the API key (pays for credits)
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- The actual API key (use crypto.randomBytes for generation)
  api_key TEXT NOT NULL UNIQUE,
  
  -- Human-readable name for the key
  name TEXT NOT NULL,
  description TEXT,
  
  -- Security: Domain whitelist (NULL = allow all domains)
  allowed_domains TEXT[],
  
  -- Rate limiting
  rate_limit_per_hour INTEGER DEFAULT 100,
  rate_limit_per_day INTEGER DEFAULT 1000,
  
  -- Usage tracking
  total_requests INTEGER DEFAULT 0,
  total_minutes_used INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX embed_api_keys_user_id_idx ON public.embed_api_keys(user_id);
CREATE INDEX embed_api_keys_api_key_idx ON public.embed_api_keys(api_key) WHERE is_active = TRUE;
CREATE INDEX embed_api_keys_active_idx ON public.embed_api_keys(is_active, user_id);

-- RLS Policies
ALTER TABLE public.embed_api_keys ENABLE ROW LEVEL SECURITY;

-- Users can view their own API keys
CREATE POLICY "embed_api_keys_select_own"
  ON public.embed_api_keys FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can create their own API keys
CREATE POLICY "embed_api_keys_insert_own"
  ON public.embed_api_keys FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own API keys
CREATE POLICY "embed_api_keys_update_own"
  ON public.embed_api_keys FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own API keys
CREATE POLICY "embed_api_keys_delete_own"
  ON public.embed_api_keys FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Trigger to update updated_at
DROP TRIGGER IF EXISTS set_updated_at_embed_api_keys ON public.embed_api_keys;
CREATE TRIGGER set_updated_at_embed_api_keys
  BEFORE UPDATE ON public.embed_api_keys
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Update learning_sessions to track API key usage
ALTER TABLE public.learning_sessions
  ADD COLUMN IF NOT EXISTS api_key_id UUID REFERENCES public.embed_api_keys(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_embedded BOOLEAN DEFAULT FALSE;

-- Index for API key session lookups
CREATE INDEX IF NOT EXISTS learning_sessions_api_key_idx ON public.learning_sessions(api_key_id, created_at DESC);

-- Update RLS policy to allow API key access
CREATE POLICY "learning_sessions_select_by_api_key"
  ON public.learning_sessions FOR SELECT
  TO anon, authenticated
  USING (
    api_key_id IN (
      SELECT id FROM public.embed_api_keys 
      WHERE is_active = TRUE 
      AND (expires_at IS NULL OR expires_at > NOW())
    )
  );

-- Comment the tables
COMMENT ON TABLE public.embed_api_keys IS 'API keys for embedding sessions on third-party platforms. Credits are deducted from the key owner.';
COMMENT ON COLUMN public.embed_api_keys.api_key IS 'The secret API key. Should be kept secure by the developer.';
COMMENT ON COLUMN public.embed_api_keys.allowed_domains IS 'Whitelist of domains allowed to use this key. NULL = all domains allowed.';
COMMENT ON COLUMN public.learning_sessions.api_key_id IS 'If set, this session was created via an API key and credits are charged to the key owner.';

