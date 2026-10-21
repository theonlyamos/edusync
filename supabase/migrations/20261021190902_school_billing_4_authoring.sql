-- School billing, part 4: teacher authoring allowance.
--
-- Each school gets a free monthly allowance of AI-authored lesson visuals
-- (interactive visualizations and visual quizzes) and images. Past the
-- allowance each one costs credits from the school pool: 1 per visual,
-- 2 per image. Regenerations count. A generation job that finally fails gives
-- its credits and its allowance slot back.
--
-- The existing monthly limits on organization_ai_quotas stay as optional
-- hard caps that school admins set for themselves. The free allowance is
-- platform-controlled.

SET LOCAL lock_timeout = '10s';

ALTER TABLE public.organization_ai_quotas
  ADD COLUMN IF NOT EXISTS free_interactive_allowance bigint NOT NULL DEFAULT 200,
  ADD COLUMN IF NOT EXISTS free_image_allowance bigint NOT NULL DEFAULT 50;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organization_ai_quotas_free_allowance_check') THEN
    ALTER TABLE public.organization_ai_quotas
      ADD CONSTRAINT organization_ai_quotas_free_allowance_check
      CHECK (free_interactive_allowance >= 0 AND free_image_allowance >= 0);
  END IF;
END $$;

ALTER TABLE public.organization_ai_usage
  ADD COLUMN IF NOT EXISTS credits_charged integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz;

-- School admins may edit their own limits, but not the free allowance.
CREATE OR REPLACE FUNCTION public.guard_ai_free_allowance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.free_interactive_allowance := 200;
      NEW.free_image_allowance := 50;
    ELSIF NEW.free_interactive_allowance IS DISTINCT FROM OLD.free_interactive_allowance
       OR NEW.free_image_allowance IS DISTINCT FROM OLD.free_image_allowance THEN
      RAISE EXCEPTION 'The free authoring allowance is set by the platform' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER organization_ai_quotas_guard_allowance
  BEFORE INSERT OR UPDATE ON public.organization_ai_quotas
  FOR EACH ROW EXECUTE FUNCTION public.guard_ai_free_allowance();

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
  limit_used bigint;
  selected_limit bigint;
  is_school boolean;
  free_allowance bigint;
  unit_credits integer;
  billable_units bigint;
  credits_due integer := 0;
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
  WHERE organization_id = p_organization_id AND category = p_category AND period_start = current_period
    AND refunded_at IS NULL;
  IF selected_limit IS NOT NULL AND current_used + p_quantity > selected_limit THEN
    RAISE EXCEPTION 'AI_QUOTA_EXCEEDED: % usage would exceed the monthly limit', p_category;
  END IF;
  limit_used := current_used;

  SELECT o.type = 'school' INTO is_school FROM public.organizations o WHERE o.id = p_organization_id;
  -- Creative-concept suggestions are short text calls metered as
  -- interactive_generation; they neither use the allowance nor cost credits.
  IF is_school AND p_category IN ('interactive_generation', 'image_generation')
     AND p_reference_id NOT LIKE 'creative-concept:%' THEN
    SELECT COALESCE(sum(quantity), 0) INTO current_used
    FROM public.organization_ai_usage
    WHERE organization_id = p_organization_id AND category = p_category AND period_start = current_period
      AND refunded_at IS NULL AND reference_id NOT LIKE 'creative-concept:%';
    free_allowance := CASE p_category
      WHEN 'interactive_generation' THEN quota_row.free_interactive_allowance
      ELSE quota_row.free_image_allowance
    END;
    unit_credits := CASE p_category WHEN 'interactive_generation' THEN 1 ELSE 2 END;
    billable_units := LEAST(p_quantity, GREATEST(0, current_used + p_quantity - free_allowance));
    credits_due := (billable_units * unit_credits)::integer;
    IF credits_due > 0 AND public.deduct_school_credits(
      p_organization_id,
      p_user_id,
      credits_due,
      CASE p_category WHEN 'interactive_generation' THEN 'visual' ELSE 'image' END,
      'Used ' || credits_due || CASE WHEN credits_due = 1 THEN ' credit' ELSE ' credits' END
        || ' for ' || billable_units
        || CASE p_category WHEN 'interactive_generation' THEN ' lesson visual' ELSE ' lesson image' END
        || CASE WHEN billable_units = 1 THEN '' ELSE 's' END
        || ' beyond the monthly allowance',
      NULL,
      p_reference_id
    ) IS NULL THEN
      RAISE EXCEPTION 'SCHOOL_CREDITS_EXHAUSTED: the free monthly allowance is used up and the school has no credits left';
    END IF;
  END IF;

  INSERT INTO public.organization_ai_usage (organization_id, user_id, category, quantity, reference_id, period_start, credits_charged)
  VALUES (p_organization_id, p_user_id, p_category, p_quantity, p_reference_id, current_period, credits_due);
  RETURN QUERY SELECT limit_used + p_quantity, selected_limit,
    CASE WHEN selected_limit IS NULL THEN NULL ELSE selected_limit - limit_used - p_quantity END;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_organization_ai_usage(uuid, uuid, text, bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_organization_ai_usage(uuid, uuid, text, bigint, text) TO service_role;

-- A generation job that ran out of attempts gives back what it reserved.
CREATE OR REPLACE FUNCTION public.release_failed_content_job_usage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  usage_row public.organization_ai_usage%ROWTYPE;
BEGIN
  IF NEW.status <> 'failed' OR OLD.status = 'failed' OR NEW.organization_id IS NULL THEN
    RETURN NULL;
  END IF;
  FOR usage_row IN
    SELECT * FROM public.organization_ai_usage u
    WHERE u.organization_id = NEW.organization_id
      AND u.user_id = NEW.requested_by
      AND u.reference_id = NEW.idempotency_key
      AND u.category IN ('interactive_generation', 'image_generation')
      AND u.refunded_at IS NULL
    FOR UPDATE
  LOOP
    UPDATE public.organization_ai_usage SET refunded_at = now() WHERE id = usage_row.id;
    IF usage_row.credits_charged > 0 THEN
      PERFORM public.add_school_credits(
        usage_row.organization_id,
        usage_row.credits_charged,
        'refund',
        'Refund: lesson ' || CASE usage_row.category WHEN 'interactive_generation' THEN 'visual' ELSE 'image' END
          || ' could not be generated',
        usage_row.user_id,
        NULL,
        CASE usage_row.category WHEN 'interactive_generation' THEN 'visual' ELSE 'image' END,
        usage_row.reference_id
      );
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.release_failed_content_job_usage() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER content_jobs_release_failed_usage
  AFTER UPDATE OF status ON public.content_jobs
  FOR EACH ROW EXECUTE FUNCTION public.release_failed_content_job_usage();
