import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { connectToDatabase } from '@/lib/db';
import { authOptions } from '@/lib/auth';
import { ObjectId } from 'mongodb';

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'student') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const client = await connectToDatabase();
        const db = client.db();

        const chats = await db.collection('chats')
            .find({ userId: session.user.id })
            .sort({ updatedAt: -1 })
            .toArray();

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

        const client = await connectToDatabase();
        const db = client.db();

        const now = new Date().toISOString();
        const result = await db.collection('chats').insertOne({
            userId: session.user.id,
            lessonId: lessonId ? new ObjectId(lessonId) : null,
            messages,
            title,
            createdAt: now,
            updatedAt: now,
        });

        return NextResponse.json({ chatId: result.insertedId });
    } catch (error) {
        console.error('Error creating chat:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
} 