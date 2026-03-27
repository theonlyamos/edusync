-- Grade level for live class (filters lessons; optional lesson_id FK still on event)

ALTER TABLE public.live_class_events
  ADD COLUMN IF NOT EXISTS grade_level text;

CREATE INDEX IF NOT EXISTS live_class_events_organizer_grade_idx
  ON public.live_class_events (organizer_id, grade_level)
  WHERE grade_level IS NOT NULL;
