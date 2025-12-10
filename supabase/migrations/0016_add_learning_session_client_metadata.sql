-- Adds client metadata columns to learning_sessions table
ALTER TABLE public.learning_sessions
    ADD COLUMN IF NOT EXISTS domain text,
    ADD COLUMN IF NOT EXISTS ip_address text,
    ADD COLUMN IF NOT EXISTS user_agent text;

