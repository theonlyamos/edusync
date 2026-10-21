-- Lessons can be archived (hidden from teachers' default list and from
-- students) and never-published drafts can be deleted outright.
SET LOCAL lock_timeout = '10s';

ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- Approved artifacts and the assets they use are immutable, which also made
-- the ON DELETE CASCADE from lessons fail. delete_lesson_draft() marks the
-- lesson it is removing so the guards let that one cascade through.
CREATE OR REPLACE FUNCTION public.prevent_approved_artifact_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE'
     AND current_setting('insyte.deleting_lesson', true) = OLD.lesson_id::text THEN
    RETURN OLD;
  END IF;

  IF OLD.status = 'approved' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Approved lesson artifacts are immutable; create a new version';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_published_asset_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE'
     AND current_setting('insyte.deleting_lesson', true) = OLD.lesson_id::text THEN
    RETURN OLD;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.lesson_artifacts a
    WHERE a.status = 'approved' AND a.payload->>'assetId' = OLD.id::text
  ) THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Assets referenced by approved lesson artifacts are immutable';
    ELSIF OLD.storage_bucket IS DISTINCT FROM NEW.storage_bucket
      OR OLD.storage_path IS DISTINCT FROM NEW.storage_path
      OR OLD.mime_type IS DISTINCT FROM NEW.mime_type
      OR OLD.byte_size IS DISTINCT FROM NEW.byte_size
      OR OLD.checksum_sha256 IS DISTINCT FROM NEW.checksum_sha256 THEN
      RAISE EXCEPTION 'Assets referenced by approved lesson artifacts are immutable';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

-- Deletes a lesson that students never received. Returns the storage objects
-- the caller should remove. Lessons with a publication, homework or student
-- runs keep their history and must be archived instead.
-- Authorization happens in the API route (requireLessonManager); only the
-- service role may call this.
CREATE OR REPLACE FUNCTION public.delete_lesson_draft(p_lesson_id uuid)
RETURNS TABLE (storage_bucket text, storage_path text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_buckets text[];
  v_paths text[];
BEGIN
  PERFORM 1 FROM public.lessons WHERE id = p_lesson_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LESSON_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (SELECT 1 FROM public.lesson_publications WHERE lesson_id = p_lesson_id)
     OR EXISTS (SELECT 1 FROM public.homeworks WHERE lesson_id = p_lesson_id)
     OR EXISTS (SELECT 1 FROM public.learning_runs WHERE lesson_id = p_lesson_id) THEN
    RAISE EXCEPTION 'LESSON_HAS_HISTORY' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.content_jobs
    WHERE lesson_id = p_lesson_id AND status IN ('queued', 'running')
  ) THEN
    RAISE EXCEPTION 'LESSON_GENERATING' USING ERRCODE = 'P0001';
  END IF;

  SELECT array_agg(a.storage_bucket), array_agg(a.storage_path)
    INTO v_buckets, v_paths
  FROM public.lesson_assets a
  WHERE a.lesson_id = p_lesson_id;

  PERFORM set_config('insyte.deleting_lesson', p_lesson_id::text, true);
  DELETE FROM public.lessons WHERE id = p_lesson_id;
  PERFORM set_config('insyte.deleting_lesson', '', true);

  RETURN QUERY
    SELECT b, p FROM unnest(coalesce(v_buckets, '{}'), coalesce(v_paths, '{}')) AS t(b, p);
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_lesson_draft(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_lesson_draft(uuid) TO service_role;
