-- Add lesson_id column to assessments table
-- This links assessments to specific lessons

-- Add lesson_id to assessments table
ALTER TABLE public.assessments 
ADD COLUMN IF NOT EXISTS lesson_id UUID REFERENCES public.lessons(id) ON DELETE SET NULL;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_assessments_lesson_id ON public.assessments(lesson_id);
