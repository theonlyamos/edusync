import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import OpenAI from 'openai';
import { authOptions } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';
import { connectToDatabase } from '@/lib/db';
import { ObjectId } from 'mongodb';

interface Question {
    question: string;
    type: 'multiple_choice';
    options: string[];
    correctAnswer: string;
    explanation: string;
    points: number;
}

const openai = new OpenAI({
    baseURL: process.env.OPENAI_BASE_URL,
    apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'student') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { subject, topic, difficulty, type, lessonId } = await req.json();

        // If lessonId is provided, fetch lesson content
        let lessonContent = '';
        if (lessonId) {
            const client = await connectToDatabase();
            const db = client.db();

            const lesson = await db.collection('lessons').findOne({
                _id: new ObjectId(lessonId)
            });

            if (!lesson) {
                return new NextResponse('Lesson not found', { status: 404 });
            }

            // Fetch associated content
            const contents = await db.collection('lessonContent')
                .find({ lessonId: new ObjectId(lessonId) })
                .toArray();

            // Combine all content into context
            lessonContent = `
Title: ${lesson.title}
Subject: ${lesson.subject}
Grade Level: ${lesson.gradeLevel}
Objectives: ${lesson.objectives}

Content:
${contents.map(content => `
Type: ${content.type}
${JSON.stringify(content.content, null, 2)}
`).join('\n')}`;
        }

        const prompt = `Create a set of multiple choice practice exercises for:
${lessonId ? 'Based on the following lesson content:\n' + lessonContent + '\n\n' : ''}
Subject: ${subject}
Topic: ${topic}
Difficulty: ${difficulty}
Type: ${type}

Please generate 5 multiple choice questions in the following JSON format:
{
    "questions": [
        {
            "question": "question text",
            "type": "multiple_choice",
            "options": ["option1", "option2", "option3", "option4"],
            "correctAnswer": "exact text of the correct option",
            "explanation": "detailed explanation of why this answer is correct",
            "points": number (1-5 based on difficulty)
        }
    ]
}

Requirements:
1. ALL questions must be multiple choice with exactly 4 options
2. The correctAnswer must exactly match one of the options
3. Options should be clear and distinct
4. Make questions challenging but appropriate for the difficulty level
5. Include detailed explanations for each answer
${lessonId ? '6. Questions should be based on the provided lesson content' : ''}`;

        const completion = await openai.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: "You are an expert teacher creating educational practice exercises. Generate clear, engaging multiple choice questions that test understanding and critical thinking."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            model: process.env.OPENAI_MODEL as string,
            temperature: 0.7,
            response_format: { type: "json_object" },
        });

        const generatedContent = completion.choices[0].message.content;
        const exercises = JSON.parse(generatedContent || '{"questions": []}');

        // Add unique IDs to each question
        exercises.questions = exercises.questions.map((question: Question) => ({
            ...question,
            id: uuidv4()
        }));

        return NextResponse.json(exercises);
    } catch (error) {
        console.error('Error generating practice exercises:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
} 