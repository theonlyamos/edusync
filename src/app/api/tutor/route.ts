import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import OpenAI from 'openai';
import { connectToDatabase } from '@/lib/db';

const openai = new OpenAI({
    baseURL: process.env.OPENAI_BASE_URL,
    apiKey: process.env.OPENAI_API_KEY,
});

const getSystemPrompt = (gradeLevel: string) => `You are an AI tutor helping students learn various subjects. You are currently tutoring a student in grade ${gradeLevel}.

Your role is to:
1. Provide clear, concise explanations appropriate for grade ${gradeLevel} level
2. Break down complex concepts into simpler parts
3. Use examples that are relatable to a grade ${gradeLevel} student
4. Ask guiding questions to help students understand
5. Provide practice problems appropriate for grade ${gradeLevel}
6. Encourage critical thinking while keeping explanations at their level
7. Be patient, supportive, and encouraging
8. Use markdown formatting for better readability

Remember to:
- Keep explanations at the appropriate level for a grade ${gradeLevel} student
- Use analogies and real-world examples that students of this age can relate to
- Provide step-by-step solutions when solving problems
- Encourage students to think through problems themselves
- Be encouraging and positive
- If a topic is too advanced for their grade level, explain why and offer to break it down or suggest prerequisite topics to learn first
- If a topic is too basic for their grade level, acknowledge this and offer more challenging aspects of the topic`;

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'student') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        // Get student's grade level from the database
        const client = await connectToDatabase();
        const db = client.db();
        const student = await db.collection('users').findOne({
            _id: session.user.id
        });

        if (!student?.gradeLevel) {
            return new NextResponse('Student grade level not found', { status: 400 });
        }

        const { messages } = await req.json();

        const completion = await openai.chat.completions.create({
            model: process.env.OPENAI_MODEL as string,
            messages: [
                {
                    role: "system",
                    content: getSystemPrompt(student.gradeLevel)
                },
                ...messages.map((msg: any) => ({
                    role: msg.role,
                    content: msg.content
                }))
            ],
            temperature: 0.7,
            max_tokens: 1000,
        });

        const reply = completion.choices[0].message;

        return NextResponse.json({
            role: 'assistant',
            content: reply.content,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error in AI tutor:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
} 