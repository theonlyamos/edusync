-- Migration to update feedback table for user authentication
-- 1. Add user_id column
-- 2. Change id from BIGSERIAL to UUID
-- 3. Make experience field required
-- 4. Update RLS policies

-- First, drop existing policies
DROP POLICY IF EXISTS "Allow feedback inserts" ON public.feedback;
DROP POLICY IF EXISTS "Allow feedback reads for admin" ON public.feedback;

-- Drop existing trigger and function if they exist
DROP TRIGGER IF EXISTS update_feedback_updated_at ON public.feedback;

-- Create a new feedback table with the correct structure
CREATE TABLE IF NOT EXISTS public.feedback_new (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- User reference (required for authenticated feedback)
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    
    -- Core feedback data
    rating VARCHAR(10) NOT NULL CHECK (rating IN ('positive', 'neutral', 'negative')),
    experience TEXT NOT NULL, -- Now required
    improvements TEXT,
    would_recommend VARCHAR(10) NOT NULL CHECK (would_recommend IN ('yes', 'no', 'maybe')),
    
    -- Context and trigger information
    trigger_type VARCHAR(20) NOT NULL CHECK (trigger_type IN ('manual_stop', 'connection_reset', 'error')),
    
    -- Technical metadata
    user_agent TEXT,
    timestamp TIMESTAMPTZ NOT NULL,
    
    -- Session context (optional - for future use)
    session_duration_seconds INTEGER,
    connection_count INTEGER,
    error_message TEXT,
    
    -- Automatic timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Copy existing data from old table to new table (if any exists)
-- Note: This will only work if there's existing data and we can map it to users
-- For now, we'll skip copying since we don't have user mapping for existing feedback
-- INSERT INTO public.feedback_new (rating, experience, improvements, would_recommend, trigger_type, user_agent, timestamp, session_duration_seconds, connection_count, error_message, created_at, updated_at)
-- SELECT rating, experience, improvements, would_recommend, trigger_type, user_agent, timestamp, session_duration_seconds, connection_count, error_message, created_at, updated_at
-- FROM public.feedback;

-- Drop the old table and rename the new one
DROP TABLE IF EXISTS public.feedback;
ALTER TABLE public.feedback_new RENAME TO feedback;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON public.feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_timestamp ON public.feedback(timestamp);
CREATE INDEX IF NOT EXISTS idx_feedback_trigger_type ON public.feedback(trigger_type);
CREATE INDEX IF NOT EXISTS idx_feedback_rating ON public.feedback(rating);
CREATE INDEX IF NOT EXISTS idx_feedback_would_recommend ON public.feedback(would_recommend);
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON public.feedback(created_at);

-- Enable Row Level Security (RLS)
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- Create policy to allow users to insert their own feedback
CREATE POLICY "Users can insert their own feedback" ON public.feedback
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Create policy to allow users to read their own feedback
CREATE POLICY "Users can read their own feedback" ON public.feedback
    FOR SELECT USING (auth.uid() = user_id);

-- Create policy for admins to read all feedback
CREATE POLICY "Admins can read all feedback" ON public.feedback
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.users u 
            WHERE u.id = auth.uid() 
            AND u.role = 'admin'
        )
    );

-- Add comments for documentation
COMMENT ON TABLE public.feedback IS 'Stores user feedback from voice AI sessions including ratings, experiences, and contextual information';
COMMENT ON COLUMN public.feedback.id IS 'Unique UUID identifier for the feedback entry';
COMMENT ON COLUMN public.feedback.user_id IS 'Reference to the user who submitted the feedback';
COMMENT ON COLUMN public.feedback.rating IS 'Overall user rating: positive, neutral, or negative';
COMMENT ON COLUMN public.feedback.experience IS 'Free-form text describing user experience (required)';
COMMENT ON COLUMN public.feedback.improvements IS 'User suggestions for improvements (optional)';
COMMENT ON COLUMN public.feedback.would_recommend IS 'Whether user would recommend to others: yes, no, or maybe';
COMMENT ON COLUMN public.feedback.trigger_type IS 'What triggered the feedback form: manual_stop, connection_reset, or error';
COMMENT ON COLUMN public.feedback.user_agent IS 'Browser user agent string for technical context';
COMMENT ON COLUMN public.feedback.timestamp IS 'When the feedback was submitted (from client)';
COMMENT ON COLUMN public.feedback.session_duration_seconds IS 'How long the session lasted before feedback (optional)';
COMMENT ON COLUMN public.feedback.connection_count IS 'Number of connection attempts in session (optional)';
COMMENT ON COLUMN public.feedback.error_message IS 'Error message if trigger was error (optional)';

-- Recreate the function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_feedback_updated_at 
    BEFORE UPDATE ON public.feedback 
    FOR EACH ROW 
    EXECUTE FUNCTION public.update_updated_at_column();
