import { NextResponse, NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { connectToDatabase } from '@/lib/db';
import { authOptions } from '@/lib/auth';
import { ObjectId } from 'mongodb';
import { Chat } from '@/lib/models/Chat';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ chatId: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'student') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { chatId } = await params;

        await connectToDatabase();

        const chat = await Chat.findOne({
            _id: new ObjectId(chatId),
            userId: new ObjectId(session.user.id)
        }).lean();

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

        const { chatId } = params;
        const { messages } = await request.json();

        await connectToDatabase();

        const result = await Chat.updateOne(
            {
                _id: new ObjectId(chatId),
                userId: new ObjectId(session.user.id)
            },
            {
                $set: {
                    messages,
                    updatedAt: new Date()
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

        const { chatId } = params;

        await connectToDatabase();

        const result = await Chat.deleteOne({
            _id: new ObjectId(chatId),
            userId: new ObjectId(session.user.id)
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