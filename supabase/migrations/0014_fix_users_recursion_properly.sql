-- Fix infinite recursion in users table RLS policies
-- Create SECURITY DEFINER functions to check roles without triggering RLS

-- Function to check if current user is an admin (bypasses RLS)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM admins a
    WHERE a.user_id = auth.uid()
  );
END;
$$;

-- Function to check if current user is a teacher (bypasses RLS)
CREATE OR REPLACE FUNCTION public.is_teacher()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM users u
    WHERE u.id = auth.uid() 
    AND u.role = 'teacher'
  );
END;
$$;

-- Drop the problematic policies
DROP POLICY IF EXISTS "users_admin_select_all" ON users;
DROP POLICY IF EXISTS "users_admin_update_all" ON users;
DROP POLICY IF EXISTS "users_admin_insert" ON users;
DROP POLICY IF EXISTS "users_teacher_view_students" ON users;

-- Recreate them using the SECURITY DEFINER functions (no more recursion!)
CREATE POLICY "users_admin_select_all" ON users
FOR SELECT
TO authenticated
USING (is_admin());

CREATE POLICY "users_admin_update_all" ON users
FOR UPDATE
TO authenticated
USING (is_admin());

CREATE POLICY "users_admin_insert" ON users
FOR INSERT
TO authenticated
WITH CHECK (is_admin());

CREATE POLICY "users_teacher_view_students" ON users
FOR SELECT
TO authenticated
USING (role = 'student' AND is_teacher());

-- Note: The is_teacher() function can safely query the users table because
-- it's marked as SECURITY DEFINER, which bypasses RLS policies and prevents recursion

