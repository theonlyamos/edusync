-- Lets a notification say that a report card is ready.
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_kind_check CHECK (kind IN (
  'announcement', 'homework_assigned', 'homework_submitted', 'homework_returned',
  'live_class_scheduled', 'low_credits', 'report_card'
));
