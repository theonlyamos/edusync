-- Lessons can be archived (hidden from teachers' default list and from students).
SET LOCAL lock_timeout = '10s';
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS archived_at timestamptz;