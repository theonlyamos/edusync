SET LOCAL lock_timeout = '10s';
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'developer',
  ADD COLUMN IF NOT EXISTS is_default_school boolean NOT NULL DEFAULT false;
ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_type_check;
ALTER TABLE public.organizations ADD CONSTRAINT organizations_type_check CHECK (type IN ('school', 'developer'));
ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_default_is_school;
ALTER TABLE public.organizations ADD CONSTRAINT organizations_default_is_school CHECK (NOT is_default_school OR type = 'school');
CREATE UNIQUE INDEX IF NOT EXISTS organizations_single_default_school ON public.organizations (is_default_school) WHERE is_default_school;
ALTER TABLE public.organization_members DROP CONSTRAINT IF EXISTS organization_members_role_check;
ALTER TABLE public.organization_members ADD CONSTRAINT organization_members_role_check CHECK (role IN ('owner', 'admin', 'member', 'teacher', 'student'));
