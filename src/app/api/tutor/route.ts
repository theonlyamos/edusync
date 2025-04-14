import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import OpenAI from 'openai';
import { connectToDatabase } from '@/lib/db';
import { ObjectId } from 'mongodb';
import { Student } from '@/lib/models/Student';
import { Lesson } from '@/lib/models/Lesson';
import { Chat } from '@/lib/models/Chat';

const openai = new OpenAI({
    baseURL: process.env.OPENAI_BASE_URL,
    apiKey: process.env.OPENAI_API_KEY,
});

const getSystemPrompt = (gradeLevel: string, lesson?: { title: string; subject: string; objectives?: string }) => {
    let prompt = `You are an AI tutor helping students learn various subjects. You are currently tutoring a student in grade ${gradeLevel}.`;

    if (lesson) {
        prompt += `\n\nYou are specifically helping with the lesson "${lesson.title}" in the subject "${lesson.subject}".`;
        if (lesson.objectives) {
            prompt += `\nThe learning objectives for this lesson are:\n${lesson.objectives}`;
        }
    }

    prompt += `\n\nYour role is to:
1. Provide clear, concise explanations appropriate for grade ${gradeLevel} level
2. Break down complex concepts into simpler parts
3. Use examples that are relatable to a grade ${gradeLevel} student
4. Ask guiding questions to help students understand
5. Provide practice problems appropriate for grade ${gradeLevel}
6. Encourage critical thinking while keeping explanations at their level
7. Be patient, supportive, and encouraging
8. Use markdown formatting for better readability

After each response, suggest 3-4 follow-up questions that would help deepen the student's understanding of the topic.
Format your response as follows:
1. Your main explanation/answer
2. A line break
3. "Follow-up Questions:" on a new line
4. A numbered list of follow-up questions

Remember to:
- Keep explanations at the appropriate level for a grade ${gradeLevel} student
- Use analogies and real-world examples that students of this age can relate to
- Provide step-by-step solutions when solving problems
- Encourage students to think through problems themselves
- Be encouraging and positive
- If a topic is too advanced for their grade level, explain why and offer to break it down or suggest prerequisite topics to learn first
- If a topic is too basic for their grade level, acknowledge this and offer more challenging aspects of the topic`;

    return prompt;
};

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'student') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        await connectToDatabase();

        // Get student's grade level
        const student = await Student.findOne({ userId: session.user.id })

        if (!student?.grade) {
            return new NextResponse('Student grade level not found', { status: 400 });
        }

        const { messages, lessonId, chatId } = await req.json();

        // Ensure connectToDatabase is called (assuming it establishes the Mongoose connection)
        await connectToDatabase();

        // If lessonId is provided, get lesson details
        let lesson: any;
        if (lessonId) {
            // Use Mongoose findOne
            lesson = await Lesson.findOne({ _id: lessonId });
        }

        const completion = await openai.chat.completions.create({
            model: process.env.OPENAI_MODEL as string,
            messages: [
                {
                    role: "system",
                    content: getSystemPrompt(student.grade, lesson)
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
        const content = reply.content || '';

        // Split content into main response and follow-up questions
        const parts = content.split(/Follow-up Questions:/i);
        const mainResponse = parts[0].trim();
        const followUpQuestions = parts[1]
            ? parts[1]
                .trim()
                .split(/\d+\.\s+/)
                .filter(q => q.trim())
                .map(q => q.trim())
            : [];

        const tutorMessage = {
            role: 'assistant',
            content: mainResponse,
            followUpQuestions,
            timestamp: new Date().toISOString()
        };

        // If no chatId provided, create a new chat
        let newChatId;
        if (!chatId) {
            // Use Chat model to create a new chat
            const newChat = new Chat({
                userId: new ObjectId(session.user.id), // Ensure userId is ObjectId
                lessonId: lessonId ? new ObjectId(lessonId) : null, // Ensure lessonId is ObjectId
                messages: [...messages, tutorMessage],
                title: messages[0]?.content?.slice(0, 50) + '...',
                // createdAt and updatedAt are handled by Mongoose defaults/hooks
            });
            const savedChat = await newChat.save();
            newChatId = savedChat._id;
        } else {
            // Use Chat model to update existing chat
            await Chat.updateOne(
                { _id: new ObjectId(chatId) }, // Ensure chatId is ObjectId
                {
                    $push: { messages: tutorMessage },
                    $set: { updatedAt: new Date() } // Mongoose timestamp hook might handle this
                }
            );
        }

        return NextResponse.json({
            message: tutorMessage,
            chatId: newChatId || chatId
        });
    } catch (error) {
        console.error('Error in AI tutor:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
} 