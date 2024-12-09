import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { connectToDatabase } from '@/lib/db';
import { ObjectId } from 'mongodb';
import { authOptions } from '@/lib/auth';

export async function GET(
    req: Request,
    context: { params: { contentId: string } }
) {
    const { contentId } = await context.params;

    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'teacher') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const client = await connectToDatabase();
        const db = client.db();

        const content = await db.collection('lessonContent').findOne({
            _id: new ObjectId(contentId)
        });

        if (!content) {
            return new NextResponse('Content not found', { status: 404 });
        }

        return NextResponse.json(content);
    } catch (error) {
        console.error('Error fetching content:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

export async function PUT(
    req: Request,
    context: { params: { contentId: string } }
) {
    const { contentId } = await context.params;

    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'teacher') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const client = await connectToDatabase();
        const db = client.db();
        const { content } = await req.json();

        const result = await db.collection('lessonContent').findOneAndUpdate(
            { _id: new ObjectId(contentId) },
            { $set: { content } },
            { returnDocument: 'after' }
        );

        if (!result) {
            return new NextResponse('Content not found', { status: 404 });
        }

        return NextResponse.json(result);
    } catch (error) {
        console.error('Error updating content:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

export async function DELETE(
    req: Request,
    context: { params: { contentId: string } }
) {
    const { contentId } = await context.params;

    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'teacher') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const client = await connectToDatabase();
        const db = client.db();

        const result = await db.collection('lessonContent').deleteOne({
            _id: new ObjectId(contentId)
        });

        if (result.deletedCount === 0) {
            return new NextResponse('Content not found', { status: 404 });
        }

        return NextResponse.json({ message: 'Content deleted successfully' });
    } catch (error) {
        console.error('Error deleting content:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
} 