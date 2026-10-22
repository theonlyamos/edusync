-- Lesson resources (files and links teachers attach to a lesson) and the
-- assessment columns the Assessments pages need.

-- 1. Lesson resources ------------------------------------------------------
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
DROP POLICY IF EXISTS lesson_resources_select ON public.lesson_resources;
CREATE POLICY lesson_resources_select ON public.lesson_resources
  FOR SELECT TO authenticated
  USING (public.can_access_lesson(lesson_id));

-- Private bucket: uploads use server-issued signed upload URLs and downloads
-- use short-lived signed URLs, so browsers never get direct table access.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'lesson-resources', 'lesson-resources', false, 26214400,
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'text/csv',
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'audio/mpeg', 'video/mp4'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS lesson_resources_server_only ON storage.objects;
CREATE POLICY lesson_resources_server_only ON storage.objects
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (bucket_id <> 'lesson-resources')
  WITH CHECK (bucket_id <> 'lesson-resources');

-- 2. Assessments -----------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'assessments' AND column_name = 'is_published'
  ) THEN
    ALTER TABLE public.assessments ADD COLUMN is_published boolean NOT NULL DEFAULT false;
    -- Assessments that already exist were visible to students; keep them that way.
    UPDATE public.assessments SET is_published = true;
  END IF;
END $$;
ALTER TABLE public.assessments ADD COLUMN IF NOT EXISTS due_date timestamptz;

-- Students only see published assessments for their own school and grade.
DROP POLICY IF EXISTS assessments_student_select ON public.assessments;
CREATE POLICY assessments_student_select ON public.assessments
  FOR SELECT TO authenticated
  USING (
    is_published
    AND organization_id = public.current_school_id()
    AND EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.user_id = auth.uid()
        AND lower(btrim(s.grade)) = lower(btrim(assessments.gradelevel))
    )
  );

CREATE INDEX IF NOT EXISTS assessment_results_assessment_student_idx
  ON public.assessment_results (assessmentid, studentid);
