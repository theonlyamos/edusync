-- Fix infinite recursion in organization_members RLS policy
-- The issue: organizations_select_member policy queries organization_members,
-- and organization_members_select_member policy queries organizations,
-- creating a circular dependency.
--
-- Solution: Use a SECURITY DEFINER function to bypass RLS when checking membership.

-- 1. Create helper function that bypasses RLS to check membership
CREATE OR REPLACE FUNCTION is_org_member(org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS 'SELECT EXISTS (
  SELECT 1 FROM organization_members
  WHERE organization_id = org_id
    AND user_id = auth.uid()
    AND is_active = true
)';

-- 2. Drop and recreate the organizations select policy to use the helper function
DROP POLICY IF EXISTS organizations_select_member ON organizations;

CREATE POLICY organizations_select_member ON organizations
  FOR SELECT
  USING (
    auth.uid() = owner_id OR is_org_member(id)
  );
