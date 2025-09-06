-- Create feedback table in Supabase for storing user feedback from voice AI sessions
-- Run this in your Supabase SQL Editor

-- Create the feedback table
CREATE TABLE IF NOT EXISTS public.feedback (
    id BIGSERIAL PRIMARY KEY,
    
    -- Core feedback data
    rating VARCHAR(10) NOT NULL CHECK (rating IN ('positive', 'neutral', 'negative')),
    experience TEXT,
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

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_feedback_timestamp ON public.feedback(timestamp);
CREATE INDEX IF NOT EXISTS idx_feedback_trigger_type ON public.feedback(trigger_type);
CREATE INDEX IF NOT EXISTS idx_feedback_rating ON public.feedback(rating);
CREATE INDEX IF NOT EXISTS idx_feedback_would_recommend ON public.feedback(would_recommend);
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON public.feedback(created_at);

-- Enable Row Level Security (RLS)
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- Create policy to allow inserts from API (service role)
-- This allows the API to insert feedback without authentication
CREATE POLICY "Allow feedback inserts" ON public.feedback
    FOR INSERT WITH CHECK (true);

-- Create policy for reading feedback (for admin/analytics)
-- You can modify this based on your authentication needs
CREATE POLICY "Allow feedback reads for admin" ON public.feedback
    FOR SELECT USING (true);

-- Add comments for documentation
COMMENT ON TABLE public.feedback IS 'Stores user feedback from voice AI sessions including ratings, experiences, and contextual information';
COMMENT ON COLUMN public.feedback.rating IS 'Overall user rating: positive, neutral, or negative';
COMMENT ON COLUMN public.feedback.experience IS 'Free-form text describing user experience (optional)';
COMMENT ON COLUMN public.feedback.improvements IS 'User suggestions for improvements (optional)';
COMMENT ON COLUMN public.feedback.would_recommend IS 'Whether user would recommend to others: yes, no, or maybe';
COMMENT ON COLUMN public.feedback.trigger_type IS 'What triggered the feedback form: manual_stop, connection_reset, or error';
COMMENT ON COLUMN public.feedback.user_agent IS 'Browser user agent string for technical context';
COMMENT ON COLUMN public.feedback.timestamp IS 'When the feedback was submitted (from client)';
COMMENT ON COLUMN public.feedback.session_duration_seconds IS 'How long the session lasted before feedback (optional)';
COMMENT ON COLUMN public.feedback.connection_count IS 'Number of connection attempts in session (optional)';
COMMENT ON COLUMN public.feedback.error_message IS 'Error message if trigger was error (optional)';

-- Create a function to automatically update the updated_at timestamp
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
