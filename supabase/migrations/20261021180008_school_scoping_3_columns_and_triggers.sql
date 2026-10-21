SET LOCAL lock_timeout = '10s';
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT;
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT;
ALTER TABLE public.grades ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT;
ALTER TABLE public.timetables ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT;
ALTER TABLE public.assessments ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT;
ALTER TABLE public.live_class_events ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS students_organization_id_idx ON public.students (organization_id);
CREATE INDEX IF NOT EXISTS teachers_organization_id_idx ON public.teachers (organization_id);
CREATE INDEX IF NOT EXISTS grades_organization_id_idx ON public.grades (organization_id);
CREATE INDEX IF NOT EXISTS timetables_organization_id_idx ON public.timetables (organization_id);
CREATE INDEX IF NOT EXISTS assessments_organization_id_idx ON public.assessments (organization_id);
CREATE INDEX IF NOT EXISTS live_class_events_organization_id_idx ON public.live_class_events (organization_id);
CREATE INDEX IF NOT EXISTS lessons_organization_id_idx ON public.lessons (organization_id);
CREATE OR REPLACE FUNCTION public.set_school_on_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  linked_user uuid;
BEGIN
  IF NEW.organization_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME IN ('students', 'teachers') THEN
    linked_user := NEW.user_id;
  ELSIF TG_TABLE_NAME = 'live_class_events' THEN
    linked_user := NEW.organizer_id;
  ELSIF TG_TABLE_NAME = 'assessments' THEN
    linked_user := COALESCE(
      (SELECT t.user_id FROM public.teachers t WHERE t.id = NEW.teacher_id),
      NEW.createdby
    );
  ELSIF TG_TABLE_NAME = 'lessons' THEN
    linked_user := (SELECT t.user_id FROM public.teachers t WHERE t.id = NEW.teacher_id);
  END IF;
  NEW.organization_id := COALESCE(
    public.user_school_id(linked_user),
    public.user_school_id(auth.uid()),
    public.default_school_id()
  );
  RETURN NEW;
END;
$$;
CREATE OR REPLACE TRIGGER students_set_school BEFORE INSERT ON public.students FOR EACH ROW EXECUTE FUNCTION public.set_school_on_insert();
CREATE OR REPLACE TRIGGER teachers_set_school BEFORE INSERT ON public.teachers FOR EACH ROW EXECUTE FUNCTION public.set_school_on_insert();
CREATE OR REPLACE TRIGGER grades_set_school BEFORE INSERT ON public.grades FOR EACH ROW EXECUTE FUNCTION public.set_school_on_insert();
CREATE OR REPLACE TRIGGER timetables_set_school BEFORE INSERT ON public.timetables FOR EACH ROW EXECUTE FUNCTION public.set_school_on_insert();
CREATE OR REPLACE TRIGGER assessments_set_school BEFORE INSERT ON public.assessments FOR EACH ROW EXECUTE FUNCTION public.set_school_on_insert();
CREATE OR REPLACE TRIGGER live_class_events_set_school BEFORE INSERT ON public.live_class_events FOR EACH ROW EXECUTE FUNCTION public.set_school_on_insert();
CREATE OR REPLACE TRIGGER lessons_set_school BEFORE INSERT ON public.lessons FOR EACH ROW EXECUTE FUNCTION public.set_school_on_insert();
CREATE OR REPLACE FUNCTION public.ensure_school_membership_for_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF public.user_school_id(NEW.user_id) IS NOT NULL THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.organization_members (organization_id, user_id, role, is_active, invitation_accepted_at)
  VALUES (
    NEW.organization_id,
    NEW.user_id,
    CASE WHEN TG_TABLE_NAME = 'teachers' THEN 'teacher' ELSE 'student' END,
    true,
    now()
  )
  ON CONFLICT (organization_id, user_id) DO UPDATE SET is_active = true;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE TRIGGER students_school_membership AFTER INSERT ON public.students FOR EACH ROW EXECUTE FUNCTION public.ensure_school_membership_for_profile();
CREATE OR REPLACE TRIGGER teachers_school_membership AFTER INSERT ON public.teachers FOR EACH ROW EXECUTE FUNCTION public.ensure_school_membership_for_profile();
