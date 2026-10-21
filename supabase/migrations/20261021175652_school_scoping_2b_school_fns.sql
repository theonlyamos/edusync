CREATE OR REPLACE FUNCTION public.user_school_id(p_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT m.organization_id
  FROM public.organization_members m
  JOIN public.organizations o ON o.id = m.organization_id
  WHERE m.user_id = p_user_id
    AND m.is_active = true
    AND o.type = 'school'
  ORDER BY m.joined_at
  LIMIT 1;
$$;
CREATE OR REPLACE FUNCTION public.current_school_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.user_school_id(auth.uid());
$$;
REVOKE ALL ON FUNCTION public.default_school_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_school_id(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_school_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.default_school_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_school_id(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.current_school_id() TO authenticated, service_role;
