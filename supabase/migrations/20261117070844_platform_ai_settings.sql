-- The AI models the app uses, picked by platform admins on /admin/ai-models.
-- One row. A null column means "not set here": the app falls back to the env
-- var it replaced, then to a built-in default, so an empty table changes nothing.
CREATE TABLE IF NOT EXISTS public.platform_ai_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  text_provider text CHECK (char_length(text_provider) <= 32),
  text_model text CHECK (char_length(text_model) <= 120),
  visual_provider text CHECK (char_length(visual_provider) <= 32),
  visual_model text CHECK (char_length(visual_model) <= 120),
  image_model text CHECK (char_length(image_model) <= 120),
  extraction_model text CHECK (char_length(extraction_model) <= 120),
  embedding_model text CHECK (char_length(embedding_model) <= 120),
  live_model text CHECK (char_length(live_model) <= 120),
  live_voice text CHECK (char_length(live_voice) <= 32),
  agent_model text CHECK (char_length(agent_model) <= 120),
  agent_voice text CHECK (char_length(agent_voice) <= 32),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL
);

-- Only the server (service role) reads and writes it.
ALTER TABLE public.platform_ai_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_ai_settings FROM anon, authenticated;
GRANT ALL ON public.platform_ai_settings TO service_role;

-- Model changes go in the admin activity log as platform-wide actions.
ALTER TABLE public.platform_admin_actions DROP CONSTRAINT IF EXISTS platform_admin_actions_target_type_check;
ALTER TABLE public.platform_admin_actions ADD CONSTRAINT platform_admin_actions_target_type_check
  CHECK (target_type IN ('school', 'organization', 'user', 'platform'));
