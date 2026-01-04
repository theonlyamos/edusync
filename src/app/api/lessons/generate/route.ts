import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { generateAICompletion } from '@/lib/ai';

export async function POST(req: Request) {
    try {
        const session = await getServerSession();

        if (!session || !['admin', 'teacher'].includes(session.user?.role as string)) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { title, subject, gradeLevel, objectives } = await req.json();

        const prompt = `Create a detailed lesson plan for:
Title: ${title}
Subject: ${subject}
Grade Level: ${gradeLevel}
Learning Objectives: ${objectives}

Please structure the lesson plan with the following sections:
1. Lesson Overview
2. Learning Objectives
3. Required Materials
4. Activities and Timeline
5. Assessment Methods
6. Differentiation Strategies
7. Additional Resources

Make it engaging and appropriate for the specified grade level.`;

        const generatedContent = await generateAICompletion(
            "You are an experienced teacher and curriculum designer. Create detailed, engaging lesson plans that follow educational best practices.",
            prompt
        );

        return NextResponse.json({ content: generatedContent });
    } catch (error) {
        console.error('Error generating lesson:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
} 