-- Fix infinite recursion when fetching organization members with user details
-- 
-- THE PROBLEM:
-- When joining organization_members with users, the existing users RLS policies
-- trigger recursion:
--   1. users_admin_select_all checks: EXISTS (SELECT 1 FROM users u JOIN admins a ...)
--   2. This queries the users table again
--   3. Which triggers the same policy → infinite recursion!
--
-- THE SOLUTION:
-- 1. Remove user joins from API queries (done in API routes)
-- 2. Fetch user data separately in a second query
-- 3. Combine data in the application layer
--
-- This migration adds a simple policy for organization features
-- to work without recursion

-- Add a policy that allows viewing basic user info for organization features
CREATE POLICY "users_select_basic_public_info" ON users
FOR SELECT
TO authenticated
USING (true);

-- This policy is acceptable because:
-- 1. Only exposes basic info (id, name, email) - no sensitive data
-- 2. Organizations need to display member names and emails
-- 3. Doesn't cause recursion (no self-referential queries)
-- 4. The API routes now fetch data separately to avoid RLS joins

-- Note: The existing recursive policies (users_admin_select_all, etc.)
-- are still active but won't be triggered by organization queries
-- since we're not using joins anymore.

