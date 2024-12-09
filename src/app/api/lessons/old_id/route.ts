import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { connectToDatabase } from '@/lib/db';
import { ObjectId } from 'mongodb';
import { authOptions } from '@/lib/auth';

export async function GET(
    req: Request,
    { params }: { params: { lessonId: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'teacher') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const client = await connectToDatabase();
        const db = client.db();

        const lesson = await db.collection('lessons').findOne({
            _id: new ObjectId(params.lessonId)
        });

        if (!lesson) {
            return new NextResponse('Lesson not found', { status: 404 });
        }

        return NextResponse.json(lesson);
    } catch (error) {
        console.error('Error fetching lesson:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

export async function PUT(
    req: Request,
    { params }: { params: { lessonId: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'teacher') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const client = await connectToDatabase();
        const db = client.db();
        const updates = await req.json();

        const result = await db.collection('lessons').updateOne(
            { _id: new ObjectId(params.lessonId) },
            { $set: updates }
        );

        if (result.matchedCount === 0) {
            return new NextResponse('Lesson not found', { status: 404 });
        }

        return NextResponse.json({ message: 'Lesson updated successfully' });
    } catch (error) {
        console.error('Error updating lesson:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: { lessonId: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'teacher') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const client = await connectToDatabase();
        const db = client.db();

        // Delete the lesson
        const result = await db.collection('lessons').deleteOne({
            _id: new ObjectId(params.lessonId)
        });

        if (result.deletedCount === 0) {
            return new NextResponse('Lesson not found', { status: 404 });
        }

        // Delete associated content
        await db.collection('lessonContent').deleteMany({
            lessonId: new ObjectId(params.lessonId)
        });

        return NextResponse.json({ message: 'Lesson and associated content deleted successfully' });
    } catch (error) {
        console.error('Error deleting lesson:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
} 