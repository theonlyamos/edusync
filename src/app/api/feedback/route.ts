import { NextRequest, NextResponse } from 'next/server';
import { feedbackSchema } from '@/lib/validation/api';
import { rateLimit } from '@/lib/rate-limiter';
import { getAuthContext } from '@/lib/get-auth-context';
import { createClient } from '@supabase/supabase-js';

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
        const authContext = getAuthContext(request)
        const userId = authContext?.userId
        const authType = authContext?.authType
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const body = await request.json();
        const originHeader = request.headers.get('origin') || request.headers.get('referer');
        let domain: string | null = null;
        if (originHeader) {
            try {
                domain = new URL(originHeader).hostname;
            } catch {
                domain = null;
            }
        }
        if (!domain) {
            domain = request.nextUrl.hostname ?? null;
        }

        const forwardedFor = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip');
        const ipAddress = forwardedFor?.split(',')[0]?.trim() || null;

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
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // Prepare data for database insertion
        const dbData = {
            user_id: userId,
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
            domain,
            ip_address: ipAddress,
            auth_type: authType,
            session_id: feedback.sessionId || null,
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
