-- Fix search_path for all functions to prevent security issues

-- update_updated_at_column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- set_updated_at_camel
CREATE OR REPLACE FUNCTION public.set_updated_at_camel()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    NEW."updatedAt" = now();
    RETURN NEW;
END;
$$;

-- set_updated_at_snake
CREATE OR REPLACE FUNCTION public.set_updated_at_snake()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- set_updated_at (alias for set_updated_at_snake)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- is_admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM public.users u
        JOIN public.admins a ON u.id = a.user_id
        WHERE u.id = auth.uid()
    );
END;
$$;

-- is_teacher
CREATE OR REPLACE FUNCTION public.is_teacher()
RETURNS boolean
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM public.users u
        WHERE u.id = auth.uid() AND u.role = 'teacher'
    );
END;
$$;

-- is_student
CREATE OR REPLACE FUNCTION public.is_student()
RETURNS boolean
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM public.users u
        WHERE u.id = auth.uid() AND u.role = 'student'
    );
END;
$$;

-- get_user_grade
CREATE OR REPLACE FUNCTION public.get_user_grade()
RETURNS text
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    user_grade text;
BEGIN
    SELECT s.grade INTO user_grade
    FROM public.students s
    WHERE s.user_id = auth.uid();
    
    RETURN user_grade;
END;
$$;
