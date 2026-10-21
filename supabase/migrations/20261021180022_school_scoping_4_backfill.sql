SET LOCAL lock_timeout = '10s';
DO $$
DECLARE
  school uuid;
  owner uuid;
  has_school_data boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.students)
      OR EXISTS (SELECT 1 FROM public.teachers)
      OR EXISTS (SELECT 1 FROM public.lessons)
      OR EXISTS (SELECT 1 FROM public.timetables)
      OR EXISTS (SELECT 1 FROM public.grades)
      OR EXISTS (SELECT 1 FROM public.assessments)
      OR EXISTS (SELECT 1 FROM public.live_class_events)
  INTO has_school_data;
  school := public.default_school_id();
  IF school IS NULL AND has_school_data THEN
    SELECT u.id INTO owner
    FROM public.users u
    WHERE u.role = 'admin'
    ORDER BY u.created_at
    LIMIT 1;
    IF owner IS NULL THEN
      RAISE NOTICE 'School scoping: no admin user to own the default school; backfill skipped';
      RETURN;
    END IF;
    INSERT INTO public.organizations (name, description, owner_id, type, is_default_school, settings)
    VALUES ('InsyteAI School', 'Default school for accounts created before schools existed', owner, 'school', true, '{}')
    RETURNING id INTO school;
  END IF;
  IF school IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO public.organization_members (organization_id, user_id, role, is_active, invitation_accepted_at)
  SELECT school, t.user_id, 'teacher', true, now()
  FROM public.teachers t
  WHERE public.user_school_id(t.user_id) IS NULL
  ON CONFLICT (organization_id, user_id) DO NOTHING;
  INSERT INTO public.organization_members (organization_id, user_id, role, is_active, invitation_accepted_at)
  SELECT school, s.user_id, 'student', true, now()
  FROM public.students s
  WHERE public.user_school_id(s.user_id) IS NULL
  ON CONFLICT (organization_id, user_id) DO NOTHING;
  UPDATE public.teachers t SET organization_id = COALESCE(public.user_school_id(t.user_id), school)
  WHERE t.organization_id IS NULL;
  UPDATE public.students s SET organization_id = COALESCE(public.user_school_id(s.user_id), school)
  WHERE s.organization_id IS NULL;
  UPDATE public.grades SET organization_id = school WHERE organization_id IS NULL;
  UPDATE public.timetables SET organization_id = school WHERE organization_id IS NULL;
  UPDATE public.assessments a
  SET organization_id = COALESCE(
    (SELECT t.organization_id FROM public.teachers t WHERE t.id = a.teacher_id),
    public.user_school_id(a.createdby),
    school
  )
  WHERE a.organization_id IS NULL;
  UPDATE public.live_class_events e
  SET organization_id = COALESCE(public.user_school_id(e.organizer_id), school)
  WHERE e.organization_id IS NULL;
  ALTER TABLE public.lessons DISABLE TRIGGER lessons_organization_reassignment_guard;
  UPDATE public.lessons l
  SET organization_id = COALESCE(
    (SELECT t.organization_id FROM public.teachers t WHERE t.id = l.teacher_id),
    school
  )
  WHERE l.organization_id IS NULL;
  ALTER TABLE public.lessons ENABLE TRIGGER lessons_organization_reassignment_guard;
END;
$$;
