-- Useful queries for analyzing feedback data
-- Run these in your Supabase SQL Editor or any PostgreSQL client

-- 1. Get feedback summary by rating
SELECT 
    rating,
    COUNT(*) as count,
    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM public.feedback
GROUP BY rating
ORDER BY 
    CASE rating 
        WHEN 'positive' THEN 1 
        WHEN 'neutral' THEN 2 
        WHEN 'negative' THEN 3 
    END;

-- 2. Get feedback summary by trigger type
SELECT 
    trigger_type,
    COUNT(*) as count,
    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM public.feedback
GROUP BY trigger_type
ORDER BY count DESC;

-- 3. Get recommendation breakdown
SELECT 
    would_recommend,
    COUNT(*) as count,
    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM public.feedback
GROUP BY would_recommend
ORDER BY 
    CASE would_recommend 
        WHEN 'yes' THEN 1 
        WHEN 'maybe' THEN 2 
        WHEN 'no' THEN 3 
    END;

-- 4. Get recent feedback (last 24 hours)
SELECT 
    id,
    rating,
    trigger_type,
    would_recommend,
    CASE 
        WHEN LENGTH(experience) > 50 THEN LEFT(experience, 50) || '...'
        ELSE experience
    END as experience_preview,
    created_at
FROM public.feedback
WHERE created_at >= NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;

-- 5. Get feedback with experience/improvement text (non-empty)
SELECT 
    id,
    rating,
    trigger_type,
    would_recommend,
    experience,
    improvements,
    created_at
FROM public.feedback
WHERE 
    (experience IS NOT NULL AND LENGTH(TRIM(experience)) > 0)
    OR (improvements IS NOT NULL AND LENGTH(TRIM(improvements)) > 0)
ORDER BY created_at DESC
LIMIT 20;

-- 6. Get feedback trends by day (last 7 days)
SELECT 
    DATE(created_at) as date,
    COUNT(*) as total_feedback,
    COUNT(CASE WHEN rating = 'positive' THEN 1 END) as positive,
    COUNT(CASE WHEN rating = 'neutral' THEN 1 END) as neutral,
    COUNT(CASE WHEN rating = 'negative' THEN 1 END) as negative,
    COUNT(CASE WHEN trigger_type = 'manual_stop' THEN 1 END) as manual_stops,
    COUNT(CASE WHEN trigger_type = 'connection_reset' THEN 1 END) as connection_resets,
    COUNT(CASE WHEN trigger_type = 'error' THEN 1 END) as errors
FROM public.feedback
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- 7. Get average session duration by rating (if you add session tracking)
SELECT 
    rating,
    COUNT(*) as count,
    ROUND(AVG(session_duration_seconds), 2) as avg_duration_seconds,
    ROUND(AVG(session_duration_seconds) / 60.0, 2) as avg_duration_minutes
FROM public.feedback
WHERE session_duration_seconds IS NOT NULL
GROUP BY rating
ORDER BY 
    CASE rating 
        WHEN 'positive' THEN 1 
        WHEN 'neutral' THEN 2 
        WHEN 'negative' THEN 3 
    END;

-- 8. Get feedback by user agent (browser/device analysis)
SELECT 
    CASE 
        WHEN user_agent LIKE '%Chrome%' THEN 'Chrome'
        WHEN user_agent LIKE '%Firefox%' THEN 'Firefox'
        WHEN user_agent LIKE '%Safari%' AND user_agent NOT LIKE '%Chrome%' THEN 'Safari'
        WHEN user_agent LIKE '%Edge%' THEN 'Edge'
        ELSE 'Other'
    END as browser,
    COUNT(*) as count,
    ROUND(AVG(CASE WHEN rating = 'positive' THEN 1.0 WHEN rating = 'neutral' THEN 0.5 ELSE 0.0 END), 2) as satisfaction_score
FROM public.feedback
GROUP BY 
    CASE 
        WHEN user_agent LIKE '%Chrome%' THEN 'Chrome'
        WHEN user_agent LIKE '%Firefox%' THEN 'Firefox'
        WHEN user_agent LIKE '%Safari%' AND user_agent NOT LIKE '%Chrome%' THEN 'Safari'
        WHEN user_agent LIKE '%Edge%' THEN 'Edge'
        ELSE 'Other'
    END
ORDER BY count DESC;

-- 9. Export feedback for analysis (CSV-friendly format)
SELECT 
    id,
    rating,
    trigger_type,
    would_recommend,
    REPLACE(REPLACE(experience, E'\n', ' '), E'\r', ' ') as experience_clean,
    REPLACE(REPLACE(improvements, E'\n', ' '), E'\r', ' ') as improvements_clean,
    session_duration_seconds,
    connection_count,
    error_message,
    timestamp,
    created_at
FROM public.feedback
ORDER BY created_at DESC;

-- 10. Delete old feedback (run carefully - maybe after 6 months)
-- DELETE FROM public.feedback 
-- WHERE created_at < NOW() - INTERVAL '6 months';
