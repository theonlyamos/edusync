-- School branding: each school can set its colours, default light/dark look
-- and a logo. Only the server writes it (school owners and admins go through
-- /api/schools/branding, which validates every field), so the column is left
-- out of the browser's UPDATE grant on organizations.
SET LOCAL lock_timeout = '10s';

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS branding jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'organizations_branding_shape' AND conrelid = 'public.organizations'::regclass
  ) THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT organizations_branding_shape
      CHECK (jsonb_typeof(branding) = 'object' AND pg_column_size(branding) <= 2048);
  END IF;
END
$$;

-- Public bucket for school logos. Anyone can view a logo by its URL (it shows
-- on sign-in pages, emails and report cards); only the server can upload.
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('school-logos', 'school-logos', true, 524288, ARRAY['image/png', 'image/jpeg', 'image/webp'])
    ON CONFLICT (id) DO NOTHING;
  END IF;
END
$$;
