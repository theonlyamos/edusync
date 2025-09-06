import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase.server';

export const runtime = 'nodejs';

interface FeedbackData {
    rating: 'positive' | 'neutral' | 'negative';
    experience?: string;
    improvements?: string;
    wouldRecommend: 'yes' | 'no' | 'maybe';
    trigger: 'manual_stop' | 'connection_reset' | 'error';
    timestamp: string;
    userAgent: string;
    sessionDurationSeconds?: number;
    connectionCount?: number;
    errorMessage?: string;
}

export async function POST(request: NextRequest) {
    try {
        const feedback: FeedbackData = await request.json();

        // Validate required fields
        if (!feedback.rating || !feedback.wouldRecommend || !feedback.trigger) {
            return NextResponse.json(
                { error: 'Missing required fields: rating, wouldRecommend, or trigger' },
                { status: 400 }
            );
        }

        // Create Supabase client
        const supabase = createServerSupabase();

        // Prepare data for database insertion
        const dbData = {
            rating: feedback.rating,
            experience: feedback.experience || null,
            improvements: feedback.improvements || null,
            would_recommend: feedback.wouldRecommend,
            trigger_type: feedback.trigger,
            user_agent: feedback.userAgent,
            timestamp: feedback.timestamp,
            session_duration_seconds: feedback.sessionDurationSeconds || null,
            connection_count: feedback.connectionCount || null,
            error_message: feedback.errorMessage || null,
        };

        // Insert feedback into database
        const { data, error } = await supabase
            .from('feedback')
            .insert([dbData])
            .select()
            .single();

        if (error) {
            console.error('Database error:', error);
            return NextResponse.json(
                { error: 'Failed to save feedback to database' },
                { status: 500 }
            );
        }

        // Feedback saved successfully to database

        return NextResponse.json({
            success: true,
            message: 'Feedback saved successfully',
            id: data.id
        });

    } catch (error) {
        console.error('Failed to process feedback:', error);
        return NextResponse.json(
            { error: 'Failed to process feedback' },
            { status: 500 }
        );
    }
}
