CREATE OR REPLACE FUNCTION public.default_school_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT o.id FROM public.organizations o WHERE o.is_default_school LIMIT 1;
$$;
