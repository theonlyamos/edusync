/**
 * POST /api/agents/tutor
 *
 * Runs the tutor orchestrator agent which coordinates content generation
 * and visualization sub-agents to provide a rich tutoring experience.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/get-auth-context';
import { rateLimit } from '@/lib/rate-limiter';
import { runTutor, type TutorRequest } from '@/lib/agents/tutor-agent';

export async function POST(request: NextRequest) {
    try {
        // Auth check
        const authContext = getAuthContext(request);
        if (!authContext) {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }

        // Rate limiting
        const rateLimitResponse = await rateLimit(request, 'api');
        if (rateLimitResponse) return rateLimitResponse;

        const body = await request.json();
        const { message, studentId, lessonId, subject, gradeLevel } = body;

        if (!message) {
            return NextResponse.json(
                { error: 'message is required' },
                { status: 400 },
            );
        }

        const tutorRequest: TutorRequest = {
            message,
            studentId: studentId ?? authContext.userId,
            lessonId,
            subject,
            gradeLevel,
        };

        const result = await runTutor(tutorRequest);

        return NextResponse.json(result);
    } catch (error: any) {
        console.error('Tutor agent error:', error);
        return NextResponse.json(
            { error: 'Failed to process tutoring request', details: error.message },
            { status: 500 },
        );
    }
}
