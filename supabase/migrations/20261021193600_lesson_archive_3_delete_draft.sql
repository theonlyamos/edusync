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