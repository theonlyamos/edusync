import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase.server';
import { getServerSession } from '@/lib/auth';
import { feedbackSchema } from '@/lib/validation/api';
import { rateLimit } from '@/lib/rate-limiter';

// Type is now inferred from the Zod schema
type FeedbackData = typeof feedbackSchema._output;

export async function POST(request: NextRequest) {
    try {
        // Apply rate limiting
        const rateLimitResponse = await rateLimit(request, 'api');
        if (rateLimitResponse) {
            return rateLimitResponse;
        }

        // Check authentication
        const session = await getServerSession();
        if (!session?.user) {
            return NextResponse.json(
                { error: 'Authentication required' },
                { status: 401 }
            );
        }

        const body = await request.json();

        // Validate input with Zod schema
        const validation = feedbackSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json(
                { error: 'Invalid input', details: validation.error.flatten() },
                { status: 400 }
            );
        }

        const feedback = validation.data;

        // Create Supabase client
        const supabase = createServerSupabase();

        // Prepare data for database insertion
        const dbData = {
            user_id: session.user.id, // Add user_id from session
            rating: feedback.rating,
            experience: feedback.experience.trim(), // Required field, already validated
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
