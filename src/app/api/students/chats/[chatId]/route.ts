import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { connectToDatabase } from '@/lib/db';
import { authOptions } from '@/lib/auth';
import { ObjectId } from 'mongodb';

export async function GET(
    request: Request,
    { params }: { params: { chatId: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'student') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { chatId } = await params;

        const client = await connectToDatabase();
        const db = client.db();

        const chat = await db.collection('chats').findOne({
            _id: new ObjectId(chatId),
            userId: session.user.id
        });

        if (!chat) {
            return new NextResponse('Chat not found', { status: 404 });
        }

        return NextResponse.json(chat);
    } catch (error) {
        console.error('Error fetching chat:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

export async function PUT(
    request: Request,
    { params }: { params: { chatId: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'student') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { chatId } = await params;

        const { messages } = await request.json();

        const client = await connectToDatabase();
        const db = client.db();

        const result = await db.collection('chats').updateOne(
            {
                _id: new ObjectId(chatId),
                userId: session.user.id
            },
            {
                $set: {
                    messages,
                    updatedAt: new Date().toISOString()
                }
            }
        );

        if (result.matchedCount === 0) {
            return new NextResponse('Chat not found', { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error updating chat:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: { chatId: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'student') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { chatId } = await params;

        const client = await connectToDatabase();
        const db = client.db();

        const result = await db.collection('chats').deleteOne({
            _id: new ObjectId(chatId),
            userId: session.user.id
        });

        if (result.deletedCount === 0) {
            return new NextResponse('Chat not found', { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting chat:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
} 