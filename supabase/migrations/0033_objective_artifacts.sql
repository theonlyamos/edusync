-- Teacher-curated, objective-scoped lesson artifacts and learning runs.

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.lesson_objectives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  text text NOT NULL CHECK (btrim(text) <> ''),
  position integer NOT NULL CHECK (position >= 0),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  UNIQUE (id, lesson_id)
);

CREATE TABLE IF NOT EXISTS public.lesson_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  objective_id uuid REFERENCES public.lesson_objectives(id) ON DELETE CASCADE,
  asset_type text NOT NULL CHECK (asset_type IN ('generated_image', 'uploaded_media')),
  storage_bucket text NOT NULL,
  storage_path text NOT NULL,
  mime_type text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size >= 0),
  checksum_sha256 text NOT NULL,
  original_filename text,
  alt_text text,
  caption text,
  processing_status text NOT NULL DEFAULT 'ready'
    CHECK (processing_status IN ('quarantined', 'processing', 'ready', 'failed')),
  processing_error text,
  created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (storage_bucket, storage_path)
);

CREATE TABLE IF NOT EXISTS public.lesson_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  objective_id uuid NOT NULL REFERENCES public.lesson_objectives(id) ON DELETE CASCADE,
  series_id uuid NOT NULL DEFAULT gen_random_uuid(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  objective_revision integer NOT NULL CHECK (objective_revision > 0),
  supersedes_id uuid REFERENCES public.lesson_artifacts(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (
    kind IN ('interactive_visualization', 'generated_image', 'structured_quiz', 'visual_quiz', 'uploaded_media')
  ),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'failed', 'rejected')),
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  payload jsonb NOT NULL,
  source text NOT NULL CHECK (source IN ('ai_generated', 'teacher_uploaded', 'teacher_authored')),
  validation_report jsonb,
  generation_metadata jsonb,
  created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  approved_by uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (series_id, version)
);

CREATE TABLE IF NOT EXISTS public.lesson_asset_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.lesson_assets(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  objective_id uuid REFERENCES public.lesson_objectives(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position >= 0),
  content text NOT NULL CHECK (btrim(content) <> ''),
  embedding extensions.vector(1536) NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, position)
);

CREATE TABLE IF NOT EXISTS public.lesson_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  manifest jsonb NOT NULL,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  content_hash text NOT NULL,
  published_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  published_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lesson_id, version),
  UNIQUE (lesson_id, content_hash),
  UNIQUE (id, lesson_id)
);

ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS current_publication_id uuid
  REFERENCES public.lesson_publications(id) ON DELETE SET NULL;
ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS organization_id uuid
  REFERENCES public.organizations(id) ON DELETE SET NULL;

-- Private originals; clients receive short-lived signed URLs from an authorized API route.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('lesson-assets', 'lesson-assets', false, 10485760)
ON CONFLICT (id) DO UPDATE
SET public = false, file_size_limit = 10485760;

CREATE TABLE IF NOT EXISTS public.learning_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  publication_id uuid NOT NULL,
  active_objective_id uuid,
  mode text NOT NULL DEFAULT 'tutor' CHECK (mode IN ('companion', 'tutor')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, student_id, lesson_id),
  FOREIGN KEY (publication_id, lesson_id) REFERENCES public.lesson_publications(id, lesson_id) ON DELETE RESTRICT,
  FOREIGN KEY (active_objective_id, lesson_id) REFERENCES public.lesson_objectives(id, lesson_id) ON DELETE SET NULL (active_objective_id)
);

CREATE TABLE IF NOT EXISTS public.learning_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL,
  student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  objective_id uuid REFERENCES public.lesson_objectives(id) ON DELETE SET NULL,
  objective_revision integer,
  artifact_id uuid REFERENCES public.lesson_artifacts(id) ON DELETE SET NULL,
  instance_id uuid,
  event_type text NOT NULL CHECK (
    event_type IN (
      'artifact_resolved',
      'artifact_rendered',
      'visual_quiz_completed',
      'quiz_submitted',
      'objective_changed',
      'objective_advanced',
      'objective_mastered'
    )
  ),
  source text CHECK (source IN ('teacher_approved', 'session_generated')),
  request_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, request_id),
  FOREIGN KEY (run_id, student_id, lesson_id) REFERENCES public.learning_runs(id, student_id, lesson_id) ON DELETE CASCADE
);

-- Answer keys for session-generated quizzes never enter student-readable event payloads.
CREATE TABLE IF NOT EXISTS public.learning_quiz_keys (
  instance_id uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES public.learning_runs(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Durable, idempotent reservations cap paid session-generated content even when a lesson has no organization.
CREATE TABLE IF NOT EXISTS public.learning_fallback_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.learning_runs(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  objective_id uuid NOT NULL REFERENCES public.lesson_objectives(id) ON DELETE CASCADE,
  request_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, request_id)
);

CREATE TABLE IF NOT EXISTS public.content_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  objective_id uuid REFERENCES public.lesson_objectives(id) ON DELETE CASCADE,
  artifact_id uuid REFERENCES public.lesson_artifacts(id) ON DELETE SET NULL,
  asset_id uuid REFERENCES public.lesson_assets(id) ON DELETE SET NULL,
  requested_by uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  job_type text NOT NULL CHECK (
    job_type IN (
      'generate_interactive',
      'generate_image',
      'generate_structured_quiz',
      'generate_visual_quiz',
      'extract_media',
      'embed_media'
    )
  ),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  idempotency_key text NOT NULL,
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb,
  provider_usage jsonb,
  error text,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
  lease_owner text,
  lease_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  UNIQUE (requested_by, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.organization_ai_quotas (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  monthly_interactive_limit bigint CHECK (monthly_interactive_limit IS NULL OR monthly_interactive_limit >= 0),
  monthly_image_limit bigint CHECK (monthly_image_limit IS NULL OR monthly_image_limit >= 0),
  monthly_quiz_limit bigint CHECK (monthly_quiz_limit IS NULL OR monthly_quiz_limit >= 0),
  monthly_media_bytes_limit bigint CHECK (monthly_media_bytes_limit IS NULL OR monthly_media_bytes_limit >= 0),
  monthly_student_fallback_limit bigint CHECK (monthly_student_fallback_limit IS NULL OR monthly_student_fallback_limit >= 0),
  allow_student_fallback boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.organization_ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('interactive_generation', 'image_generation', 'quiz_generation', 'media_bytes', 'student_fallback')),
  quantity bigint NOT NULL CHECK (quantity > 0),
  reference_id text NOT NULL,
  period_start date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id, category, reference_id)
);

CREATE INDEX IF NOT EXISTS lesson_objectives_lesson_position_idx
  ON public.lesson_objectives (lesson_id, position);
CREATE UNIQUE INDEX IF NOT EXISTS lesson_objectives_active_position_uidx
  ON public.lesson_objectives (lesson_id, position)
  WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS lesson_artifacts_objective_status_position_idx
  ON public.lesson_artifacts (objective_id, status, position);
CREATE UNIQUE INDEX IF NOT EXISTS lesson_artifacts_generation_job_uidx
  ON public.lesson_artifacts ((generation_metadata->>'jobId'))
  WHERE generation_metadata ? 'jobId';
CREATE INDEX IF NOT EXISTS lesson_asset_chunks_embedding_idx
  ON public.lesson_asset_chunks USING hnsw (embedding extensions.vector_cosine_ops);
CREATE INDEX IF NOT EXISTS lesson_publications_lesson_version_idx
  ON public.lesson_publications (lesson_id, version DESC);
CREATE INDEX IF NOT EXISTS learning_runs_student_lesson_idx
  ON public.learning_runs (student_id, lesson_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS learning_events_student_objective_idx
  ON public.learning_events (student_id, objective_id, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS learning_events_artifact_idx
  ON public.learning_events (artifact_id, event_type);
CREATE UNIQUE INDEX IF NOT EXISTS learning_event_instance_uidx
  ON public.learning_events (run_id, instance_id, event_type)
  WHERE instance_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS content_jobs_claim_idx
  ON public.content_jobs (status, lease_expires_at, created_at);
CREATE INDEX IF NOT EXISTS organization_ai_usage_period_idx
  ON public.organization_ai_usage (organization_id, period_start, category);
CREATE INDEX IF NOT EXISTS learning_fallback_reservations_scope_idx
  ON public.learning_fallback_reservations (run_id, objective_id, created_at);

-- Preserve existing objective arrays without guessing associations for legacy lesson_content rows.
INSERT INTO public.lesson_objectives (lesson_id, text, position)
SELECT l.id, btrim(item.objective), (item.ordinality - 1)::integer
FROM public.lessons l
CROSS JOIN LATERAL unnest(COALESCE(l.objectives, '{}'::text[])) WITH ORDINALITY AS item(objective, ordinality)
WHERE btrim(item.objective) <> ''
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.can_manage_lesson(p_lesson_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.role() = 'service_role' OR EXISTS (
    SELECT 1
    FROM public.lessons l
    LEFT JOIN public.teachers t ON t.id = l.teacher_id
    WHERE l.id = p_lesson_id
      AND (
        t.user_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_lesson(p_lesson_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.can_manage_lesson(p_lesson_id)
    OR EXISTS (
      SELECT 1
      FROM public.lessons l
      JOIN public.students s ON s.user_id = auth.uid()
      WHERE l.id = p_lesson_id
        AND (l.gradelevel IS NULL OR lower(btrim(l.gradelevel)) = lower(btrim(s.grade)))
    );
$$;

CREATE OR REPLACE FUNCTION public.create_lesson_draft(
  p_title text,
  p_subject text,
  p_grade_level text,
  p_content text,
  p_objectives jsonb,
  p_organization_id uuid,
  p_owner_user_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_lesson_id uuid;
  normalized_objectives text[];
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Only the lesson API may create lesson drafts';
  END IF;
  IF btrim(p_title) = '' OR btrim(p_subject) = '' OR btrim(p_grade_level) = '' THEN
    RAISE EXCEPTION 'Title, subject, and grade level are required';
  END IF;
  IF jsonb_typeof(p_objectives) <> 'array' OR jsonb_array_length(p_objectives) = 0 THEN
    RAISE EXCEPTION 'At least one objective is required';
  END IF;
  IF p_organization_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = p_organization_id AND m.user_id = p_owner_user_id AND m.is_active = true
  ) THEN
    RAISE EXCEPTION 'Owner is not an active member of the selected organization';
  END IF;

  SELECT array_agg(btrim(value) ORDER BY ordinality)
  INTO normalized_objectives
  FROM jsonb_array_elements_text(p_objectives) WITH ORDINALITY AS objective(value, ordinality)
  WHERE btrim(value) <> '';
  IF COALESCE(array_length(normalized_objectives, 1), 0) = 0 THEN
    RAISE EXCEPTION 'At least one non-empty objective is required';
  END IF;

  INSERT INTO public.lessons (
    title, subject, gradelevel, objectives, content, teacher_id, organization_id, created_at, updated_at
  )
  VALUES (
    btrim(p_title), btrim(p_subject), btrim(p_grade_level), normalized_objectives, p_content,
    (SELECT id FROM public.teachers WHERE user_id = p_owner_user_id LIMIT 1), p_organization_id, now(), now()
  )
  RETURNING id INTO new_lesson_id;

  INSERT INTO public.lesson_objectives (lesson_id, text, position)
  SELECT new_lesson_id, objective, (ordinality - 1)::integer
  FROM unnest(normalized_objectives) WITH ORDINALITY AS item(objective, ordinality);

  RETURN new_lesson_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_lesson_draft(text, text, text, text, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_lesson_draft(text, text, text, text, jsonb, uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.save_lesson_objectives(p_lesson_id uuid, p_objectives jsonb)
RETURNS SETOF public.lesson_objectives
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item jsonb;
  requested_id uuid;
  existing_text text;
  next_text text;
  next_position integer;
BEGIN
  IF NOT public.can_manage_lesson(p_lesson_id) THEN
    RAISE EXCEPTION 'Not authorized to manage this lesson';
  END IF;

  IF jsonb_typeof(p_objectives) <> 'array' OR jsonb_array_length(p_objectives) = 0 THEN
    RAISE EXCEPTION 'At least one objective is required';
  END IF;

  -- Free the active position range so reorders cannot violate the partial unique index.
  UPDATE public.lesson_objectives
  SET position = position + 1000, updated_at = now()
  WHERE lesson_id = p_lesson_id AND archived_at IS NULL;

  FOR item IN SELECT value FROM jsonb_array_elements(p_objectives)
  LOOP
    next_text := btrim(item->>'text');
    next_position := (item->>'position')::integer;
    IF next_text = '' OR next_position < 0 THEN
      RAISE EXCEPTION 'Invalid objective';
    END IF;

    requested_id := NULLIF(item->>'id', '')::uuid;
    IF requested_id IS NULL THEN
      INSERT INTO public.lesson_objectives (lesson_id, text, position)
      VALUES (p_lesson_id, next_text, next_position);
    ELSE
      SELECT text INTO existing_text
      FROM public.lesson_objectives
      WHERE id = requested_id AND lesson_id = p_lesson_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Objective does not belong to this lesson';
      END IF;

      UPDATE public.lesson_objectives
      SET text = next_text,
          position = next_position,
          revision = CASE WHEN existing_text IS DISTINCT FROM next_text THEN revision + 1 ELSE revision END,
          archived_at = NULL,
          updated_at = now()
      WHERE id = requested_id;
    END IF;
  END LOOP;

  UPDATE public.lesson_objectives
  SET archived_at = now(), updated_at = now()
  WHERE lesson_id = p_lesson_id AND archived_at IS NULL AND position >= 1000;

  RETURN QUERY
    SELECT * FROM public.lesson_objectives
    WHERE lesson_id = p_lesson_id AND archived_at IS NULL
    ORDER BY position;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_lesson_objectives(uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_lesson_authoring(
  p_lesson_id uuid,
  p_title text,
  p_subject text,
  p_grade_level text,
  p_content text,
  p_objectives jsonb
)
RETURNS SETOF public.lesson_objectives
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  objective_texts text[];
BEGIN
  IF NOT public.can_manage_lesson(p_lesson_id) THEN
    RAISE EXCEPTION 'Not authorized to manage this lesson';
  END IF;
  SELECT array_agg(btrim(item->>'text') ORDER BY (item->>'position')::integer)
  INTO objective_texts
  FROM jsonb_array_elements(p_objectives) AS item;
  UPDATE public.lessons
  SET title = btrim(p_title), subject = btrim(p_subject), gradelevel = btrim(p_grade_level),
      content = p_content, objectives = objective_texts, updated_at = now()
  WHERE id = p_lesson_id;
  RETURN QUERY SELECT * FROM public.save_lesson_objectives(p_lesson_id, p_objectives);
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_lesson_authoring(uuid, text, text, text, text, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.insert_generated_lesson_artifact(
  p_lesson_id uuid,
  p_objective_id uuid,
  p_objective_revision integer,
  p_kind text,
  p_position integer,
  p_payload jsonb,
  p_validation_report jsonb,
  p_generation_metadata jsonb,
  p_created_by uuid,
  p_series_id uuid DEFAULT NULL,
  p_supersedes_id uuid DEFAULT NULL
)
RETURNS public.lesson_artifacts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_series_id uuid := COALESCE(p_series_id, gen_random_uuid());
  next_version integer;
  inserted public.lesson_artifacts%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Only the content worker may insert generated artifacts';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(selected_series_id::text, 0));
  IF p_supersedes_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.lesson_artifacts a
    WHERE a.id = p_supersedes_id AND a.series_id = selected_series_id
      AND a.lesson_id = p_lesson_id AND a.objective_id = p_objective_id
  ) THEN
    RAISE EXCEPTION 'Superseded artifact is not in the requested series';
  END IF;
  SELECT COALESCE(max(version), 0) + 1 INTO next_version
  FROM public.lesson_artifacts WHERE series_id = selected_series_id;
  INSERT INTO public.lesson_artifacts (
    lesson_id, objective_id, series_id, version, objective_revision, supersedes_id,
    kind, status, position, payload, source, validation_report, generation_metadata, created_by
  ) VALUES (
    p_lesson_id, p_objective_id, selected_series_id, next_version, p_objective_revision, p_supersedes_id,
    p_kind, 'draft', p_position, p_payload, 'ai_generated', p_validation_report, p_generation_metadata, p_created_by
  ) RETURNING * INTO inserted;
  RETURN inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.insert_generated_lesson_artifact(uuid, uuid, integer, text, integer, jsonb, jsonb, jsonb, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.insert_generated_lesson_artifact(uuid, uuid, integer, text, integer, jsonb, jsonb, jsonb, uuid, uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_content_jobs(
  p_worker_id text,
  p_limit integer DEFAULT 1,
  p_lease_seconds integer DEFAULT 120
)
RETURNS SETOF public.content_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Only the content worker may claim jobs';
  END IF;

  UPDATE public.content_jobs
  SET status = 'failed', completed_at = now(), error = COALESCE(error, 'Worker lease expired after maximum attempts')
  WHERE status = 'running' AND lease_expires_at < now() AND attempt_count >= max_attempts;

  RETURN QUERY
  WITH candidates AS (
    SELECT id
    FROM public.content_jobs
    WHERE (status = 'queued' OR (status = 'running' AND lease_expires_at < now()))
      AND attempt_count < max_attempts
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT greatest(1, least(p_limit, 20))
  )
  UPDATE public.content_jobs jobs
  SET status = 'running',
      lease_owner = p_worker_id,
      lease_expires_at = now() + make_interval(secs => greatest(30, p_lease_seconds)),
      attempt_count = jobs.attempt_count + 1,
      started_at = COALESCE(jobs.started_at, now()),
      error = NULL
  FROM candidates
  WHERE jobs.id = candidates.id
  RETURNING jobs.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.match_lesson_asset_chunks(
  p_query_embedding extensions.vector(1536),
  p_lesson_id uuid,
  p_objective_id uuid,
  p_asset_ids uuid[],
  p_match_count integer DEFAULT 5
)
RETURNS TABLE (chunk_id uuid, asset_id uuid, content text, metadata jsonb, similarity double precision)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT c.id, c.asset_id, c.content, c.metadata, 1 - (c.embedding <=> p_query_embedding) AS similarity
  FROM public.lesson_asset_chunks c
  WHERE c.lesson_id = p_lesson_id
    AND (p_objective_id IS NULL OR c.objective_id = p_objective_id)
    AND c.asset_id = ANY(p_asset_ids)
    AND public.can_access_lesson(c.lesson_id)
  ORDER BY c.embedding <=> p_query_embedding
  LIMIT greatest(1, least(p_match_count, 10));
$$;

REVOKE ALL ON FUNCTION public.match_lesson_asset_chunks(extensions.vector, uuid, uuid, uuid[], integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_lesson_asset_chunks(extensions.vector, uuid, uuid, uuid[], integer) TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_organization_ai_usage(
  p_organization_id uuid,
  p_user_id uuid,
  p_category text,
  p_quantity bigint,
  p_reference_id text
)
RETURNS TABLE (used bigint, quota_limit bigint, remaining bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  quota_row public.organization_ai_quotas%ROWTYPE;
  current_period date := date_trunc('month', now())::date;
  current_used bigint;
  selected_limit bigint;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Only trusted application services may reserve AI usage';
  END IF;
  IF p_quantity <= 0 OR p_category NOT IN ('interactive_generation', 'image_generation', 'quiz_generation', 'media_bytes', 'student_fallback') THEN
    RAISE EXCEPTION 'Invalid AI usage reservation';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = p_organization_id AND m.user_id = p_user_id AND m.is_active = true
  ) AND NOT EXISTS (
    SELECT 1 FROM public.organizations o WHERE o.id = p_organization_id AND o.owner_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'User is not an active organization member';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.organization_ai_usage
    WHERE organization_id = p_organization_id AND user_id = p_user_id AND category = p_category AND reference_id = p_reference_id
  ) THEN
    RETURN QUERY SELECT 0::bigint, NULL::bigint, NULL::bigint;
    RETURN;
  END IF;

  INSERT INTO public.organization_ai_quotas (organization_id) VALUES (p_organization_id)
  ON CONFLICT (organization_id) DO NOTHING;
  SELECT * INTO quota_row FROM public.organization_ai_quotas WHERE organization_id = p_organization_id FOR UPDATE;
  IF EXISTS (
    SELECT 1 FROM public.organization_ai_usage
    WHERE organization_id = p_organization_id AND user_id = p_user_id AND category = p_category AND reference_id = p_reference_id
  ) THEN
    RETURN QUERY SELECT 0::bigint, NULL::bigint, NULL::bigint;
    RETURN;
  END IF;
  selected_limit := CASE p_category
    WHEN 'interactive_generation' THEN quota_row.monthly_interactive_limit
    WHEN 'image_generation' THEN quota_row.monthly_image_limit
    WHEN 'quiz_generation' THEN quota_row.monthly_quiz_limit
    WHEN 'media_bytes' THEN quota_row.monthly_media_bytes_limit
    WHEN 'student_fallback' THEN quota_row.monthly_student_fallback_limit
  END;
  SELECT COALESCE(sum(quantity), 0) INTO current_used
  FROM public.organization_ai_usage
  WHERE organization_id = p_organization_id AND category = p_category AND period_start = current_period;
  IF selected_limit IS NOT NULL AND current_used + p_quantity > selected_limit THEN
    RAISE EXCEPTION 'AI_QUOTA_EXCEEDED: % usage would exceed the monthly limit', p_category;
  END IF;
  INSERT INTO public.organization_ai_usage (organization_id, user_id, category, quantity, reference_id, period_start)
  VALUES (p_organization_id, p_user_id, p_category, p_quantity, p_reference_id, current_period);
  RETURN QUERY SELECT current_used + p_quantity, selected_limit,
    CASE WHEN selected_limit IS NULL THEN NULL ELSE selected_limit - current_used - p_quantity END;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_organization_ai_usage(uuid, uuid, text, bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_organization_ai_usage(uuid, uuid, text, bigint, text) TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_organization_ai_usage_batch(
  p_organization_id uuid,
  p_user_id uuid,
  p_items jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item jsonb;
BEGIN
  IF auth.role() <> 'service_role' OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Invalid AI usage batch reservation';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    PERFORM * FROM public.reserve_organization_ai_usage(
      p_organization_id,
      p_user_id,
      item->>'category',
      (item->>'quantity')::bigint,
      item->>'referenceId'
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_organization_ai_usage_batch(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_organization_ai_usage_batch(uuid, uuid, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_learning_fallback(
  p_run_id uuid,
  p_student_id uuid,
  p_objective_id uuid,
  p_request_id text,
  p_limit integer,
  p_organization_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_used integer;
BEGIN
  IF auth.role() <> 'service_role' OR p_limit <= 0 OR btrim(p_request_id) = '' THEN
    RAISE EXCEPTION 'Invalid learning fallback reservation';
  END IF;

  PERFORM 1 FROM public.learning_runs
  WHERE id = p_run_id AND student_id = p_student_id AND active_objective_id = p_objective_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Learning run is not owned by the student or objective is inactive';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.learning_fallback_reservations
    WHERE run_id = p_run_id AND request_id = p_request_id
  ) THEN
    RETURN true;
  END IF;

  SELECT count(*) INTO current_used
  FROM public.learning_fallback_reservations
  WHERE run_id = p_run_id AND objective_id = p_objective_id;
  IF current_used >= p_limit THEN
    RAISE EXCEPTION 'LEARNING_FALLBACK_LIMIT_EXCEEDED: generated content allowance is exhausted';
  END IF;

  IF p_organization_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.organization_ai_quotas
      WHERE organization_id = p_organization_id AND allow_student_fallback = false
    ) THEN
      RAISE EXCEPTION 'STUDENT_FALLBACK_DISABLED: organization policy disallows generated fallback content';
    END IF;
    PERFORM * FROM public.reserve_organization_ai_usage(
      p_organization_id,
      p_student_id,
      'student_fallback',
      1,
      p_request_id
    );
  END IF;

  INSERT INTO public.learning_fallback_reservations (run_id, student_id, objective_id, request_id)
  VALUES (p_run_id, p_student_id, p_objective_id, p_request_id);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_learning_fallback(uuid, uuid, uuid, text, integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_learning_fallback(uuid, uuid, uuid, text, integer, uuid) TO service_role;

-- Reserve organization usage and enqueue every job in one transaction.
CREATE OR REPLACE FUNCTION public.enqueue_content_jobs_with_usage(
  p_organization_id uuid,
  p_user_id uuid,
  p_rows jsonb,
  p_usage_items jsonb DEFAULT '[]'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item jsonb;
BEGIN
  IF auth.role() <> 'service_role' OR jsonb_typeof(p_rows) <> 'array' OR jsonb_typeof(p_usage_items) <> 'array' THEN
    RAISE EXCEPTION 'Invalid content job enqueue request';
  END IF;
  IF p_organization_id IS NOT NULL AND jsonb_array_length(p_usage_items) > 0 THEN
    PERFORM public.reserve_organization_ai_usage_batch(p_organization_id, p_user_id, p_usage_items);
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    IF (item->>'requested_by')::uuid IS DISTINCT FROM p_user_id THEN
      RAISE EXCEPTION 'Content job requester mismatch';
    END IF;
    INSERT INTO public.content_jobs (
      id, batch_id, lesson_id, objective_id, artifact_id, asset_id, requested_by,
      organization_id, job_type, idempotency_key, input
    ) VALUES (
      COALESCE(NULLIF(item->>'id', '')::uuid, gen_random_uuid()),
      (item->>'batch_id')::uuid,
      (item->>'lesson_id')::uuid,
      NULLIF(item->>'objective_id', '')::uuid,
      NULLIF(item->>'artifact_id', '')::uuid,
      NULLIF(item->>'asset_id', '')::uuid,
      p_user_id,
      p_organization_id,
      item->>'job_type',
      item->>'idempotency_key',
      COALESCE(item->'input', '{}'::jsonb)
    ) ON CONFLICT (requested_by, idempotency_key) DO NOTHING;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_content_jobs_with_usage(uuid, uuid, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_content_jobs_with_usage(uuid, uuid, jsonb, jsonb) TO service_role;

-- Storage is created first; this function atomically reserves quota and creates all database records.
CREATE OR REPLACE FUNCTION public.create_uploaded_lesson_artifact(
  p_organization_id uuid,
  p_user_id uuid,
  p_usage_reference text,
  p_asset jsonb,
  p_artifact jsonb,
  p_job jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_asset public.lesson_assets%ROWTYPE;
  inserted_artifact public.lesson_artifacts%ROWTYPE;
  inserted_job public.content_jobs%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Only trusted application services may create uploaded lesson artifacts';
  END IF;
  IF p_organization_id IS NOT NULL THEN
    PERFORM * FROM public.reserve_organization_ai_usage(
      p_organization_id, p_user_id, 'media_bytes', (p_asset->>'byte_size')::bigint, p_usage_reference
    );
  END IF;

  INSERT INTO public.lesson_assets (
    id, lesson_id, objective_id, asset_type, storage_bucket, storage_path, mime_type,
    byte_size, checksum_sha256, original_filename, alt_text, caption, processing_status, created_by
  ) VALUES (
    (p_asset->>'id')::uuid, (p_asset->>'lesson_id')::uuid, (p_asset->>'objective_id')::uuid,
    p_asset->>'asset_type', p_asset->>'storage_bucket', p_asset->>'storage_path', p_asset->>'mime_type',
    (p_asset->>'byte_size')::bigint, p_asset->>'checksum_sha256', p_asset->>'original_filename',
    p_asset->>'alt_text', NULLIF(p_asset->>'caption', ''), p_asset->>'processing_status', p_user_id
  ) RETURNING * INTO inserted_asset;

  INSERT INTO public.lesson_artifacts (
    id, lesson_id, objective_id, objective_revision, kind, status, position, payload,
    source, validation_report, created_by
  ) VALUES (
    (p_artifact->>'id')::uuid, (p_artifact->>'lesson_id')::uuid, (p_artifact->>'objective_id')::uuid,
    (p_artifact->>'objective_revision')::integer, p_artifact->>'kind', 'draft',
    (p_artifact->>'position')::integer, p_artifact->'payload', 'teacher_uploaded',
    '{"status":"passed","validator":"upload-contract"}'::jsonb, p_user_id
  ) RETURNING * INTO inserted_artifact;

  INSERT INTO public.content_jobs (
    id, batch_id, lesson_id, objective_id, artifact_id, asset_id, requested_by,
    organization_id, job_type, idempotency_key, input
  ) VALUES (
    (p_job->>'id')::uuid, (p_job->>'batch_id')::uuid, (p_job->>'lesson_id')::uuid,
    (p_job->>'objective_id')::uuid, inserted_artifact.id, inserted_asset.id, p_user_id,
    p_organization_id, p_job->>'job_type', p_job->>'idempotency_key', p_job->'input'
  ) RETURNING * INTO inserted_job;

  RETURN jsonb_build_object(
    'asset', to_jsonb(inserted_asset),
    'artifact', to_jsonb(inserted_artifact),
    'job', to_jsonb(inserted_job)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_uploaded_lesson_artifact(uuid, uuid, text, jsonb, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_uploaded_lesson_artifact(uuid, uuid, text, jsonb, jsonb, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.publish_lesson_manifest(
  p_lesson_id uuid,
  p_manifest jsonb,
  p_warnings jsonb,
  p_content_hash text,
  p_published_by uuid
)
RETURNS public.lesson_publications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  publication public.lesson_publications%ROWTYPE;
  next_version integer;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Only trusted application services may publish lessons';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_lesson_id::text, 0));

  SELECT * INTO publication FROM public.lesson_publications
  WHERE lesson_id = p_lesson_id AND content_hash = p_content_hash;
  IF NOT FOUND THEN
    SELECT COALESCE(max(version), 0) + 1 INTO next_version
    FROM public.lesson_publications WHERE lesson_id = p_lesson_id;
    INSERT INTO public.lesson_publications (
      lesson_id, version, manifest, warnings, content_hash, published_by
    ) VALUES (
      p_lesson_id, next_version, p_manifest, p_warnings, p_content_hash, p_published_by
    ) RETURNING * INTO publication;
  END IF;

  UPDATE public.lessons
  SET current_publication_id = publication.id, updated_at = now()
  WHERE id = p_lesson_id;
  RETURN publication;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_lesson_manifest(uuid, jsonb, jsonb, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_lesson_manifest(uuid, jsonb, jsonb, text, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.claim_content_jobs(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_content_jobs(text, integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.prevent_approved_artifact_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'approved' THEN
    RAISE EXCEPTION 'Approved lesson artifacts are immutable; create a new version';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lesson_artifacts_approved_immutable ON public.lesson_artifacts;
CREATE TRIGGER lesson_artifacts_approved_immutable
BEFORE UPDATE OR DELETE ON public.lesson_artifacts
FOR EACH ROW EXECUTE FUNCTION public.prevent_approved_artifact_mutation();

CREATE OR REPLACE FUNCTION public.prevent_published_asset_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
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
$$;

DROP TRIGGER IF EXISTS lesson_assets_published_immutable ON public.lesson_assets;
CREATE TRIGGER lesson_assets_published_immutable
BEFORE UPDATE OR DELETE ON public.lesson_assets
FOR EACH ROW EXECUTE FUNCTION public.prevent_published_asset_mutation();

CREATE OR REPLACE FUNCTION public.prevent_publication_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Lesson publications are immutable';
END;
$$;

DROP TRIGGER IF EXISTS lesson_publications_immutable ON public.lesson_publications;
CREATE TRIGGER lesson_publications_immutable
BEFORE UPDATE OR DELETE ON public.lesson_publications
FOR EACH ROW EXECUTE FUNCTION public.prevent_publication_mutation();

ALTER TABLE public.lesson_objectives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_asset_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_quiz_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_ai_quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_fallback_reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY lesson_objectives_select ON public.lesson_objectives
  FOR SELECT TO authenticated USING (public.can_access_lesson(lesson_id));
CREATE POLICY lesson_objectives_manage ON public.lesson_objectives
  FOR ALL TO authenticated USING (public.can_manage_lesson(lesson_id))
  WITH CHECK (public.can_manage_lesson(lesson_id));

CREATE POLICY lesson_assets_select ON public.lesson_assets
  FOR SELECT TO authenticated USING (public.can_access_lesson(lesson_id));
CREATE POLICY lesson_assets_manage ON public.lesson_assets
  FOR ALL TO authenticated USING (public.can_manage_lesson(lesson_id))
  WITH CHECK (public.can_manage_lesson(lesson_id));
CREATE POLICY lesson_asset_chunks_teacher_select ON public.lesson_asset_chunks
  FOR SELECT TO authenticated USING (public.can_manage_lesson(lesson_id));

CREATE POLICY lesson_artifacts_teacher_select ON public.lesson_artifacts
  FOR SELECT TO authenticated USING (public.can_manage_lesson(lesson_id));
CREATE POLICY lesson_artifacts_teacher_manage ON public.lesson_artifacts
  FOR ALL TO authenticated USING (public.can_manage_lesson(lesson_id))
  WITH CHECK (public.can_manage_lesson(lesson_id));

CREATE POLICY lesson_publications_select ON public.lesson_publications
  FOR SELECT TO authenticated USING (
    public.can_manage_lesson(lesson_id)
    OR EXISTS (
      SELECT 1 FROM public.lessons l
      WHERE l.id = lesson_id
        AND l.current_publication_id = lesson_publications.id
        AND public.can_access_lesson(l.id)
    )
  );
CREATE POLICY lesson_publications_manage ON public.lesson_publications
  FOR INSERT TO authenticated WITH CHECK (public.can_manage_lesson(lesson_id));

-- Learners may read their history, but only trusted server routes append runs/events.
CREATE POLICY learning_runs_own_select ON public.learning_runs
  FOR SELECT TO authenticated USING (student_id = auth.uid());

CREATE POLICY learning_events_own_select ON public.learning_events
  FOR SELECT TO authenticated USING (student_id = auth.uid());
CREATE POLICY learning_fallback_reservations_own_select ON public.learning_fallback_reservations
  FOR SELECT TO authenticated USING (student_id = auth.uid());

CREATE POLICY content_jobs_select_own ON public.content_jobs
  FOR SELECT TO authenticated USING (requested_by = auth.uid() OR public.can_manage_lesson(lesson_id));
CREATE POLICY content_jobs_insert_own ON public.content_jobs
  FOR INSERT TO authenticated WITH CHECK (requested_by = auth.uid() AND public.can_manage_lesson(lesson_id));
CREATE POLICY content_jobs_update_own ON public.content_jobs
  FOR UPDATE TO authenticated USING (requested_by = auth.uid() AND public.can_manage_lesson(lesson_id));

CREATE POLICY organization_ai_quotas_admin_select ON public.organization_ai_quotas
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = organization_ai_quotas.organization_id AND m.user_id = auth.uid() AND m.is_active = true AND m.role IN ('owner', 'admin')
  ));
CREATE POLICY organization_ai_quotas_admin_update ON public.organization_ai_quotas
  FOR UPDATE TO authenticated USING (EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = organization_ai_quotas.organization_id AND m.user_id = auth.uid() AND m.is_active = true AND m.role IN ('owner', 'admin')
  ));
CREATE POLICY organization_ai_usage_admin_select ON public.organization_ai_usage
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = organization_ai_usage.organization_id AND m.user_id = auth.uid() AND m.is_active = true AND m.role IN ('owner', 'admin')
  ));
