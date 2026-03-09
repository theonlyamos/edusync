/**
 * POST /api/agents/content
 *
 * Generates educational content using the ADK content agent.
 * Accepts the same body shape as /api/content/generate for compatibility.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { generateContent, type ContentGenerationRequest } from '@/lib/agents/content-agent';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: NextRequest) {
    try {
        // Auth: require teacher role
        const session = await getServerSession();
        if (!session || session.user?.role !== 'teacher') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const body = await request.json();
        const { title, subject, gradeLevel, contentType, topic, lessonId } = body;

        if (!contentType || !topic || !subject || !gradeLevel) {
            return NextResponse.json(
                { error: 'Missing required fields: contentType, topic, subject, gradeLevel' },
                { status: 400 },
            );
        }

        const validTypes = ['quiz', 'worksheet', 'explanation', 'summary'];
        if (!validTypes.includes(contentType)) {
            return NextResponse.json(
                { error: `Invalid contentType. Must be one of: ${validTypes.join(', ')}` },
                { status: 400 },
            );
        }

        const contentRequest: ContentGenerationRequest = {
            contentType,
            topic,
            subject,
            gradeLevel,
            title,
            lessonId,
        };

        const result = await generateContent(contentRequest);

        // Add UUIDs to items that need them (same post-processing as original route)
        if (contentType === 'quiz' && result.questions) {
            result.questions = result.questions.map((q: any) => ({ ...q, id: uuidv4() }));
        } else if (contentType === 'worksheet' && result.problems) {
            result.problems = result.problems.map((p: any) => ({ ...p, id: uuidv4() }));
        } else if (contentType === 'explanation' && result.sections) {
            result.sections = result.sections.map((s: any) => ({ ...s, id: uuidv4() }));
        } else if (contentType === 'summary' && result.topics) {
            result.topics = result.topics.map((t: any) => ({ ...t, id: uuidv4() }));
        }

        return NextResponse.json(result);
    } catch (error: any) {
        console.error('Content agent error:', error);
        return NextResponse.json(
            { error: 'Failed to generate content', details: error.message },
            { status: 500 },
        );
    }
}
