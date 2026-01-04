-- Fix infinite recursion in admins table RLS policy
-- The existing policy queries the admins table to determine access to admins table itself

-- Drop the problematic policy that causes infinite recursion
DROP POLICY IF EXISTS admins_superadmin_all ON public.admins;

-- Create a new policy that only checks the users table role
-- This avoids the recursive query by not joining back to admins
CREATE POLICY admins_superadmin_all ON public.admins
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );
