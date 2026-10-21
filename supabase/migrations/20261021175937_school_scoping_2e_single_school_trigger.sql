SET LOCAL lock_timeout = '10s';
CREATE OR REPLACE TRIGGER organization_members_single_school
BEFORE INSERT OR UPDATE OF organization_id, user_id, is_active ON public.organization_members
FOR EACH ROW EXECUTE FUNCTION public.enforce_single_school_membership();
