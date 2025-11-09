-- Fix infinite recursion in organization RLS policies
-- The issue: organizations_select_member policy queries organization_members,
-- which triggers organization_members_select_member policy,
-- creating circular dependency -> infinite recursion!

-- Solution: Simplify the organizations_select_member policy to not query organization_members
-- Instead, rely on the application layer (API routes) to check permissions properly

-- Drop the problematic policies and recreate them
DROP POLICY IF EXISTS "organizations_select_member" ON organizations;
DROP POLICY IF EXISTS "organization_members_select_member" ON organization_members;

-- Organizations: Users can only see organizations where they are the owner
-- The API route will handle fetching organizations where user is a member
CREATE POLICY "organizations_select_member" ON organizations 
FOR SELECT USING (
  auth.uid()::uuid = owner_id
);

-- Organization members: Users can see their own membership records OR records in orgs they own
CREATE POLICY "organization_members_select_member" ON organization_members 
FOR SELECT USING (
  user_id = auth.uid()::uuid OR 
  EXISTS (
    SELECT 1 FROM organizations 
    WHERE organizations.id = organization_members.organization_id 
    AND organizations.owner_id = auth.uid()::uuid
  )
);

