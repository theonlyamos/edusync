import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { connectToDatabase } from '@/lib/db';
import { authOptions } from '@/lib/auth';
import { ObjectId } from 'mongodb';
import { Chat } from '@/lib/models/Chat';

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'student') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        await connectToDatabase();

        const chats = await Chat.find({ userId: new ObjectId(session.user.id) })
            .sort({ updatedAt: -1 })
            .lean();

        return NextResponse.json(chats);
    } catch (error) {
        console.error('Error fetching chats:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'student') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { lessonId, messages, title } = await req.json();

        await connectToDatabase();

        const chat = new Chat({
            userId: new ObjectId(session.user.id),
            lessonId: lessonId ? new ObjectId(lessonId) : null,
            messages,
            title
        });
        const savedChat = await chat.save();

        return NextResponse.json({ chatId: savedChat._id });
    } catch (error) {
        console.error('Error creating chat:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
} 