import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import OpenAI from 'openai';
import { authOptions } from '@/lib/auth';

const openai = new OpenAI({
    baseURL: 'https://api.groq.com/openai/v1',
    apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'teacher') {
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

        const completion = await openai.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: "You are an experienced teacher and curriculum designer. Create detailed, engaging lesson plans that follow educational best practices."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            model: "llama-3.3-70b-versatile",
            temperature: 0.7,
            max_tokens: 8192,
        });

        const generatedContent = completion.choices[0].message.content;

        return NextResponse.json({ content: generatedContent });
    } catch (error) {
        console.error('Error generating lesson:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
} 