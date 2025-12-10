-- Clean up unused metadata columns on feedback table
ALTER TABLE public.feedback
    DROP COLUMN IF EXISTS domain,
    DROP COLUMN IF EXISTS ip_address,
    DROP COLUMN IF EXISTS auth_type;

-- Ensure session_id column exists for linking to learning sessions
ALTER TABLE public.feedback
    ADD COLUMN IF NOT EXISTS session_id uuid;

