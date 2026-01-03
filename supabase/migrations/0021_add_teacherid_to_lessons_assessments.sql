-- Add teacherid column to lessons and assessments tables
-- This links lessons and assessments to specific teachers

-- Add teacherid to lessons table
ALTER TABLE public.lessons 
ADD COLUMN IF NOT EXISTS teacher_id UUID REFERENCES public.teachers(id) ON DELETE SET NULL;

-- Add teacherid to assessments table
ALTER TABLE public.assessments 
ADD COLUMN IF NOT EXISTS teacher_id UUID REFERENCES public.teachers(id) ON DELETE SET NULL;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_lessons_teacherid ON public.lessons(teacherid);
CREATE INDEX IF NOT EXISTS idx_assessments_teacherid ON public.assessments(teacherid);
