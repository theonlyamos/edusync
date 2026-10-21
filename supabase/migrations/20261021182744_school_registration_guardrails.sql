-- School registration part 2: schools are only created through register_school().
SET LOCAL lock_timeout = '10s';

ALTER POLICY organizations_insert_own ON public.organizations
WITH CHECK (
  auth.uid() = owner_id
  AND type = 'developer'
  AND NOT is_default_school
  AND credits = 0
  AND total_credits_purchased = 0
  AND total_credits_used = 0
);

REVOKE UPDATE ON public.organizations FROM anon, authenticated;
GRANT UPDATE (name, description, is_active, settings, credits, country, timezone, grade_levels, setup_dismissed_at, updated_at)
  ON public.organizations TO authenticated;

ALTER POLICY organization_members_insert_admin ON public.organization_members
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.organizations o
    WHERE o.id = organization_members.organization_id
      AND o.owner_id = auth.uid()
      AND o.type <> 'school'
  )
);

ALTER POLICY organization_members_update_admin ON public.organization_members
USING (
  EXISTS (
    SELECT 1 FROM public.organizations o
    WHERE o.id = organization_members.organization_id
      AND o.owner_id = auth.uid()
      AND o.type <> 'school'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.organizations o
    WHERE o.id = organization_members.organization_id
      AND o.owner_id = auth.uid()
      AND o.type <> 'school'
  )
);

REVOKE EXECUTE ON FUNCTION public.student_user_ids_for_grade_level(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.student_user_ids_for_grade_level(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.user_school_id(uuid) FROM PUBLIC, anon, authenticated;
