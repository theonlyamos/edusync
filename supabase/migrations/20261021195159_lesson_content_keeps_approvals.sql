-- Lesson text (lessons.content) is not used to generate visuals, quizzes or
-- introductions, so editing it no longer marks approved materials as outdated.
CREATE OR REPLACE FUNCTION public.bump_lesson_visual_revision()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF ROW(OLD.title, OLD.subject, OLD.gradelevel, OLD.objectives, OLD.visual_instructions)
     IS DISTINCT FROM ROW(NEW.title, NEW.subject, NEW.gradelevel, NEW.objectives, NEW.visual_instructions) THEN
    NEW.visual_revision := OLD.visual_revision + 1;
    -- Objective materials inherit this context; old approvals must not satisfy a new publication.
    IF ROW(OLD.title, OLD.subject, OLD.gradelevel, OLD.visual_instructions)
       IS DISTINCT FROM ROW(NEW.title, NEW.subject, NEW.gradelevel, NEW.visual_instructions) THEN
      UPDATE public.lesson_objectives SET revision = revision + 1, updated_at = now()
      WHERE lesson_id = OLD.id AND archived_at IS NULL;
    END IF;
  ELSE
    NEW.visual_revision := OLD.visual_revision;
  END IF;
  RETURN NEW;
END;
$$;