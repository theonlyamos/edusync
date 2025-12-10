-- Adds domain and ip_address columns to feedback table
ALTER TABLE public.feedback
    ADD COLUMN IF NOT EXISTS domain text,
    ADD COLUMN IF NOT EXISTS ip_address text,
    ADD COLUMN IF NOT EXISTS auth_type text,
    ADD COLUMN IF NOT EXISTS session_id uuid;

