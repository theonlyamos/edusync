SET LOCAL lock_timeout = '10s';

-- Email and CSV invites. The token column holds the SHA-256 hex of the invite
-- token; the token itself only travels in the invite link.
ALTER TABLE public.organization_invitations
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS grade_level text,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS send_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.organization_invitations DROP CONSTRAINT IF EXISTS organization_invitations_role_check;
ALTER TABLE public.organization_invitations ADD CONSTRAINT organization_invitations_role_check
  CHECK (role IN ('admin', 'member', 'teacher', 'student'));
ALTER TABLE public.organization_invitations DROP CONSTRAINT IF EXISTS organization_invitations_details_check;
ALTER TABLE public.organization_invitations ADD CONSTRAINT organization_invitations_details_check CHECK (
  email = lower(btrim(email))
  AND position('@' IN email) > 1
  AND char_length(email) <= 254
  AND (name IS NULL OR char_length(name) <= 120)
  AND (role <> 'student' OR grade_level IS NOT NULL)
  AND (grade_level IS NULL OR char_length(grade_level) <= 40)
);
CREATE UNIQUE INDEX IF NOT EXISTS organization_invitations_one_open
  ON public.organization_invitations (organization_id, email)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;
COMMENT ON COLUMN public.organization_invitations.token IS 'SHA-256 hex of the invite token. The token itself is only in the invite link.';
-- Invites are only read and written by the server and the functions below.
REVOKE ALL ON public.organization_invitations FROM anon, authenticated;

-- Class join codes: a teacher or school admin shares a code; students who use
-- it ask to join that school and grade, and a school admin approves them.
CREATE TABLE IF NOT EXISTS public.school_join_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9]{6,12}$'),
  grade_level text NOT NULL CHECK (char_length(grade_level) BETWEEN 1 AND 40),
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS school_join_codes_organization_id_idx ON public.school_join_codes (organization_id);

CREATE TABLE IF NOT EXISTS public.school_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  join_code_id uuid REFERENCES public.school_join_codes(id) ON DELETE SET NULL,
  grade_level text NOT NULL CHECK (char_length(grade_level) BETWEEN 1 AND 40),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined', 'cancelled')),
  decided_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS school_join_requests_organization_id_idx ON public.school_join_requests (organization_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS school_join_requests_one_pending ON public.school_join_requests (user_id) WHERE status = 'pending';

ALTER TABLE public.school_join_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_join_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_join_codes, public.school_join_requests FROM anon, authenticated;
GRANT ALL ON public.school_join_codes, public.school_join_requests TO service_role;

-- Adds a person to a school with the given role and creates their teacher or
-- student profile. Internal: callers check who may add whom.
CREATE OR REPLACE FUNCTION public.join_school_as(
  p_user_id uuid,
  p_school_id uuid,
  p_role text,
  p_grade_level text,
  p_added_by uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_app_role text;
  v_current_school uuid;
  v_student_school uuid;
  v_teacher_school uuid;
  v_has_student boolean;
  v_has_teacher boolean;
BEGIN
  IF p_role NOT IN ('admin', 'teacher', 'student') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Unknown school role';
  END IF;
  IF p_role = 'student' AND p_grade_level IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Students need a grade';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = p_school_id AND type = 'school' AND is_active) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'This school is not taking new members';
  END IF;

  SELECT role INTO v_app_role FROM users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Finish setting up your account first';
  END IF;
  IF v_app_role = 'admin' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Platform admin accounts cannot join a school';
  END IF;

  v_current_school := user_school_id(p_user_id);
  IF v_current_school IS NOT NULL THEN
    IF v_current_school = p_school_id THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'You are already a member of this school';
    END IF;
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'You already belong to another school';
  END IF;

  SELECT organization_id INTO v_student_school FROM students WHERE user_id = p_user_id;
  v_has_student := FOUND;
  SELECT organization_id INTO v_teacher_school FROM teachers WHERE user_id = p_user_id;
  v_has_teacher := FOUND;
  IF p_role = 'student' AND v_has_teacher THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'This is a teacher account. Use another email to join as a student.';
  END IF;
  IF p_role IN ('teacher', 'admin') AND v_has_student THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'This is a student account. Use another email to join as staff.';
  END IF;
  IF p_role = 'admin' AND v_has_teacher THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'This is a teacher account. Ask the school to invite you as a teacher.';
  END IF;
  IF (v_has_student AND v_student_school IS DISTINCT FROM p_school_id)
     OR (v_has_teacher AND v_teacher_school IS DISTINCT FROM p_school_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'This account has records in another school';
  END IF;

  INSERT INTO organization_members (organization_id, user_id, role, invited_by, invitation_accepted_at, is_active)
  VALUES (p_school_id, p_user_id, p_role, p_added_by, now(), true)
  ON CONFLICT (organization_id, user_id) DO UPDATE
    SET role = EXCLUDED.role,
        invited_by = EXCLUDED.invited_by,
        invitation_accepted_at = EXCLUDED.invitation_accepted_at,
        is_active = true;

  IF p_role = 'student' THEN
    IF v_has_student THEN
      UPDATE students SET grade = p_grade_level WHERE user_id = p_user_id;
    ELSE
      INSERT INTO students (user_id, grade, organization_id) VALUES (p_user_id, p_grade_level, p_school_id);
    END IF;
    UPDATE users SET role = 'student' WHERE id = p_user_id;
  ELSIF p_role = 'teacher' THEN
    IF NOT v_has_teacher THEN
      INSERT INTO teachers (user_id, organization_id) VALUES (p_user_id, p_school_id);
    END IF;
    UPDATE users SET role = 'teacher' WHERE id = p_user_id;
  ELSE
    -- School admins use the school pages, not the student portal.
    UPDATE users SET role = 'learner' WHERE id = p_user_id AND role = 'student';
  END IF;
END;
$$;

-- Accepts an email invite for the signed-in person. The invite must have been
-- sent to their (confirmed) email address.
CREATE OR REPLACE FUNCTION public.accept_school_invite(p_token text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_confirmed timestamptz;
  v_invite organization_invitations%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Sign in to accept this invite';
  END IF;
  SELECT lower(email), email_confirmed_at INTO v_email, v_confirmed FROM auth.users WHERE id = v_uid;

  SELECT * INTO v_invite FROM organization_invitations
  WHERE token = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'This invite link is not valid';
  END IF;
  IF v_invite.accepted_at IS NOT NULL THEN
    IF v_invite.accepted_by = v_uid THEN
      RETURN jsonb_build_object('organization_id', v_invite.organization_id, 'role', v_invite.role);
    END IF;
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'This invite has already been used';
  END IF;
  IF v_invite.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'This invite was cancelled';
  END IF;
  IF v_invite.expires_at < now() THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'This invite has expired. Ask your school to send a new one.';
  END IF;
  IF v_email IS DISTINCT FROM v_invite.email THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'This invite was sent to a different email address';
  END IF;
  IF v_confirmed IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Confirm your email address first';
  END IF;

  PERFORM join_school_as(v_uid, v_invite.organization_id, v_invite.role, v_invite.grade_level, v_invite.invited_by);
  UPDATE organization_invitations SET accepted_at = now(), accepted_by = v_uid WHERE id = v_invite.id;
  RETURN jsonb_build_object('organization_id', v_invite.organization_id, 'role', v_invite.role);
END;
$$;

-- A signed-in student asks to join the school and grade behind a class code.
CREATE OR REPLACE FUNCTION public.request_school_join(p_code text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_code school_join_codes%ROWTYPE;
  v_role text;
  v_current_school uuid;
  v_request_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Sign in to use a class code';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_uid AND email_confirmed_at IS NOT NULL) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Confirm your email address first';
  END IF;

  SELECT c.* INTO v_code FROM school_join_codes c
  JOIN organizations o ON o.id = c.organization_id AND o.type = 'school' AND o.is_active
  WHERE c.code = upper(btrim(coalesce(p_code, '')))
    AND c.revoked_at IS NULL
    AND (c.expires_at IS NULL OR c.expires_at > now());
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'That class code is not valid';
  END IF;

  SELECT role INTO v_role FROM users WHERE id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Finish setting up your account first';
  END IF;
  IF v_role = 'admin' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Platform admin accounts cannot join a school';
  END IF;
  v_current_school := user_school_id(v_uid);
  IF v_current_school = v_code.organization_id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'You are already a member of this school';
  ELSIF v_current_school IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'You already belong to another school';
  END IF;
  IF EXISTS (SELECT 1 FROM teachers WHERE user_id = v_uid) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Class codes are for students. Ask your school for a teacher invite.';
  END IF;
  IF EXISTS (SELECT 1 FROM students WHERE user_id = v_uid AND organization_id IS DISTINCT FROM v_code.organization_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'This account has records in another school';
  END IF;

  -- Asking again replaces an earlier request that is still waiting.
  UPDATE school_join_requests SET status = 'cancelled', decided_at = now()
  WHERE user_id = v_uid AND status = 'pending';
  INSERT INTO school_join_requests (organization_id, user_id, join_code_id, grade_level)
  VALUES (v_code.organization_id, v_uid, v_code.id, v_code.grade_level)
  RETURNING id INTO v_request_id;

  RETURN jsonb_build_object(
    'request_id', v_request_id,
    'organization_id', v_code.organization_id,
    'grade_level', v_code.grade_level,
    'status', 'pending'
  );
END;
$$;

-- A school owner or admin approves or declines a class-code request.
CREATE OR REPLACE FUNCTION public.decide_school_join_request(p_request_id uuid, p_approve boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_request school_join_requests%ROWTYPE;
  v_status text;
BEGIN
  SELECT * INTO v_request FROM school_join_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Join request not found';
  END IF;
  IF v_uid IS NULL OR NOT EXISTS (
    SELECT 1 FROM organization_members m
    WHERE m.organization_id = v_request.organization_id
      AND m.user_id = v_uid
      AND m.is_active
      AND m.role IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only school owners and admins can approve students';
  END IF;
  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'This request was already handled';
  END IF;

  IF p_approve THEN
    PERFORM join_school_as(v_request.user_id, v_request.organization_id, 'student', v_request.grade_level, v_uid);
    v_status := 'approved';
  ELSE
    v_status := 'declined';
  END IF;
  UPDATE school_join_requests SET status = v_status, decided_by = v_uid, decided_at = now() WHERE id = v_request.id;
  RETURN jsonb_build_object('id', v_request.id, 'status', v_status);
END;
$$;

-- Records that invite emails went out (server only).
CREATE OR REPLACE FUNCTION public.mark_school_invites_sent(p_organization_id uuid, p_emails text[], p_sent_at timestamptz)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  UPDATE organization_invitations
  SET last_sent_at = p_sent_at, send_count = send_count + 1
  WHERE organization_id = p_organization_id
    AND email = ANY (p_emails)
    AND accepted_at IS NULL
    AND revoked_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.join_school_as(uuid, uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_school_as(uuid, uuid, text, text, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.mark_school_invites_sent(uuid, text[], timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_school_invites_sent(uuid, text[], timestamptz) TO service_role;
REVOKE ALL ON FUNCTION public.accept_school_invite(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.request_school_join(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.decide_school_join_request(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_school_invite(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.request_school_join(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.decide_school_join_request(uuid, boolean) TO authenticated, service_role;
