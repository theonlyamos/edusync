-- Add date_of_birth column to students table
ALTER TABLE public.students
ADD COLUMN date_of_birth DATE;

-- Add comment for documentation
COMMENT ON COLUMN public.students.date_of_birth IS 'Student date of birth';
