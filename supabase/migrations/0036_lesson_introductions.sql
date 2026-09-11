BEGIN;

ALTER TABLE public.lessons
  ADD COLUMN visual_instructions text NOT NULL DEFAULT '' CHECK (length(visual_instructions) <= 4000),
  ADD COLUMN visual_revision integer NOT NULL DEFAULT 1 CHECK (visual_revision > 0);
ALTER TABLE public.lesson_objectives
  ADD COLUMN visual_instructions text NOT NULL DEFAULT '' CHECK (length(visual_instructions) <= 4000);
ALTER TABLE public.lesson_artifacts ALTER COLUMN objective_id DROP NOT NULL;
ALTER TABLE public.lesson_artifacts ADD CONSTRAINT lesson_introduction_scope CHECK (
  objective_id IS NOT NULL OR
  (kind = 'generated_image' AND payload->>'introductionFor' IS NOT DISTINCT FROM 'lesson')
);

CREATE OR REPLACE FUNCTION public.bump_lesson_visual_revision()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF ROW(OLD.title, OLD.subject, OLD.gradelevel, OLD.content, OLD.objectives, OLD.visual_instructions)
     IS DISTINCT FROM ROW(NEW.title, NEW.subject, NEW.gradelevel, NEW.content, NEW.objectives, NEW.visual_instructions) THEN
    NEW.visual_revision := OLD.visual_revision + 1;
    -- Objective diagrams inherit this context; old approvals must not satisfy a new publication.
    IF ROW(OLD.title, OLD.subject, OLD.gradelevel, OLD.content, OLD.visual_instructions)
       IS DISTINCT FROM ROW(NEW.title, NEW.subject, NEW.gradelevel, NEW.content, NEW.visual_instructions) THEN
      UPDATE public.lesson_objectives SET revision = revision + 1, updated_at = now()
      WHERE lesson_id = OLD.id AND archived_at IS NULL;
    END IF;
  ELSE
    NEW.visual_revision := OLD.visual_revision;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER lessons_visual_revision BEFORE UPDATE ON public.lessons
FOR EACH ROW EXECUTE FUNCTION public.bump_lesson_visual_revision();

DROP FUNCTION public.save_lesson_authoring(uuid, text, text, text, text, jsonb);
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
  existing_instructions text;
  next_instructions text;
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
    next_instructions := COALESCE(item->>'visualInstructions', '');
    IF length(next_instructions) > 4000 THEN RAISE EXCEPTION 'Visual instructions exceed 4000 characters'; END IF;
    next_position := (item->>'position')::integer;
    IF next_text = '' OR next_position < 0 THEN
      RAISE EXCEPTION 'Invalid objective';
    END IF;

    requested_id := NULLIF(item->>'id', '')::uuid;
    IF requested_id IS NULL THEN
      INSERT INTO public.lesson_objectives (lesson_id, text, position, visual_instructions)
      VALUES (p_lesson_id, next_text, next_position, next_instructions);
    ELSE
      SELECT text, visual_instructions INTO existing_text, existing_instructions
      FROM public.lesson_objectives
      WHERE id = requested_id AND lesson_id = p_lesson_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Objective does not belong to this lesson';
      END IF;

      IF NOT (item ? 'visualInstructions') THEN next_instructions := existing_instructions; END IF;
      UPDATE public.lesson_objectives
      SET visual_instructions = next_instructions, text = next_text,
          position = next_position,
          revision = CASE WHEN existing_text IS DISTINCT FROM next_text OR existing_instructions IS DISTINCT FROM next_instructions THEN revision + 1 ELSE revision END,
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
  p_objectives jsonb,
  p_visual_instructions text DEFAULT NULL
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
  IF length(p_visual_instructions) > 4000 THEN RAISE EXCEPTION 'Visual instructions exceed 4000 characters'; END IF;
  SELECT array_agg(btrim(item->>'text') ORDER BY (item->>'position')::integer)
  INTO objective_texts
  FROM jsonb_array_elements(p_objectives) AS item;
  UPDATE public.lessons
  SET title = btrim(p_title), subject = btrim(p_subject), gradelevel = btrim(p_grade_level),
      visual_instructions = COALESCE(p_visual_instructions, visual_instructions),
      content = p_content, objectives = objective_texts, updated_at = now()
  WHERE id = p_lesson_id;
  RETURN QUERY SELECT * FROM public.save_lesson_objectives(p_lesson_id, p_objectives);
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_lesson_authoring(uuid, text, text, text, text, jsonb, text) TO authenticated, service_role;

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
      AND a.lesson_id = p_lesson_id AND a.objective_id IS NOT DISTINCT FROM p_objective_id
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

CREATE OR REPLACE FUNCTION public.validate_lesson_introductions(p_lesson_id uuid, p_manifest jsonb)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  current_lesson public.lessons%ROWTYPE;
  objective jsonb;
  current_objective public.lesson_objectives%ROWTYPE;
BEGIN
  SELECT * INTO STRICT current_lesson FROM public.lessons WHERE id = p_lesson_id FOR UPDATE;
  IF NOT EXISTS (
    SELECT 1 FROM public.lesson_artifacts a
    WHERE a.id::text = p_manifest->'lesson'->>'introductionArtifactId'
      AND a.lesson_id = p_lesson_id AND a.objective_id IS NULL
      AND a.objective_revision = current_lesson.visual_revision
      AND a.status = 'approved' AND a.kind = 'generated_image'
      AND a.payload->>'introductionFor' = 'lesson'
  ) THEN RAISE EXCEPTION 'INTRODUCTION_REQUIRED: Approve a current lesson introduction diagram'; END IF;
  IF (p_manifest->'lesson'->>'visualRevision')::integer IS DISTINCT FROM current_lesson.visual_revision THEN
    RAISE EXCEPTION 'INTRODUCTION_REQUIRED: Lesson changed; refresh before publishing';
  END IF;
  IF jsonb_array_length(p_manifest->'objectives') IS DISTINCT FROM (
    SELECT count(*)::integer FROM public.lesson_objectives WHERE lesson_id = p_lesson_id AND archived_at IS NULL
  ) THEN RAISE EXCEPTION 'INTRODUCTION_REQUIRED: Objectives changed; refresh before publishing'; END IF;
  FOR objective IN SELECT value FROM jsonb_array_elements(p_manifest->'objectives') LOOP
    SELECT * INTO current_objective FROM public.lesson_objectives
      WHERE id::text = objective->>'id' AND lesson_id = p_lesson_id AND archived_at IS NULL FOR SHARE;
    IF NOT FOUND OR current_objective.revision IS DISTINCT FROM (objective->>'revision')::integer
      OR current_objective.text IS DISTINCT FROM objective->>'text' THEN
      RAISE EXCEPTION 'INTRODUCTION_REQUIRED: Objective changed; refresh before publishing';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.lesson_artifacts a
      WHERE a.id::text = objective->>'introductionArtifactId'
        AND a.lesson_id = p_lesson_id AND a.objective_id = current_objective.id
        AND a.objective_revision = current_objective.revision AND a.status = 'approved'
        AND a.kind = 'generated_image' AND a.payload->>'introductionFor' = 'objective'
        AND (objective->'artifactIds') ? a.id::text
    ) THEN RAISE EXCEPTION 'INTRODUCTION_REQUIRED: Approve an introduction diagram for every objective'; END IF;
  END LOOP;
  RETURN;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_lesson_introductions(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_lesson_introductions(uuid, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.validate_publication_introductions()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  PERFORM public.validate_lesson_introductions(NEW.lesson_id, NEW.manifest);
  RETURN NEW;
END;
$$;
CREATE TRIGGER lesson_publications_require_introductions BEFORE INSERT ON public.lesson_publications
FOR EACH ROW EXECUTE FUNCTION public.validate_publication_introductions();

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
  -- Validate under the lesson row lock even when reactivating an existing content hash.
  PERFORM public.validate_lesson_introductions(p_lesson_id, p_manifest);

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

-- No generated image is silently approved or old publication rewritten. Teachers backfill in Studio.
COMMIT;
