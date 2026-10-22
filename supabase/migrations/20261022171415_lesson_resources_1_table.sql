CREATE TABLE IF NOT EXISTS public.lesson_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('file', 'link')),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 2000),
  url text CHECK (url IS NULL OR url ~* '^https?://'),
  storage_path text UNIQUE,
  filename text,
  mime_type text,
  byte_size bigint CHECK (byte_size IS NULL OR byte_size > 0),
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lesson_resources_kind_fields CHECK (
    (kind = 'link' AND url IS NOT NULL AND storage_path IS NULL)
    OR (kind = 'file' AND storage_path IS NOT NULL AND filename IS NOT NULL AND url IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS lesson_resources_lesson_idx ON public.lesson_resources (lesson_id, created_at DESC);
CREATE INDEX IF NOT EXISTS lesson_resources_org_idx ON public.lesson_resources (organization_id);

ALTER TABLE public.lesson_resources ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lesson_resources FROM PUBLIC, anon;
GRANT SELECT ON public.lesson_resources TO authenticated;
GRANT ALL ON public.lesson_resources TO service_role;

-- Reads follow lesson access; all writes go through the server (service role).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'lesson_resources' AND policyname = 'lesson_resources_select') THEN
    CREATE POLICY lesson_resources_select ON public.lesson_resources
      FOR SELECT TO authenticated
      USING (public.can_access_lesson(lesson_id));
  END IF;
END $$;
