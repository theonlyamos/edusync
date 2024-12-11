import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { connectToDatabase } from '@/lib/db';
import { ObjectId } from 'mongodb';
import { authOptions } from '@/lib/auth';

export async function GET(
    req: Request,
    context: { params: { lessonId: string } }
) {
    const { lessonId } = await context.params;

    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const client = await connectToDatabase();
        const db = client.db();

        // For teachers, return their own lessons
        // For students, return any lesson (for now, until we implement lesson assignment)
        const query = session.user.role === 'teacher'
            ? { _id: new ObjectId(lessonId), teacherId: session.user.id }
            : { _id: new ObjectId(lessonId) };

        const lesson = await db.collection('lessons').findOne(query);

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
    context: { params: { lessonId: string } }
) {
    const { lessonId } = await context.params;

    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'teacher') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const client = await connectToDatabase();
        const db = client.db();
        const updates = await req.json();

        const result = await db.collection('lessons').updateOne(
            { _id: new ObjectId(lessonId) },
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
    context: { params: { lessonId: string } }
) {
    const { lessonId } = await context.params;

    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'teacher') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const client = await connectToDatabase();
        const db = client.db();

        // Delete the lesson
        const result = await db.collection('lessons').deleteOne({
            _id: new ObjectId(lessonId)
        });

        if (result.deletedCount === 0) {
            return new NextResponse('Lesson not found', { status: 404 });
        }

        // Delete associated content
        await db.collection('lessonContent').deleteMany({
            lessonId: new ObjectId(lessonId)
        });

        return NextResponse.json({ message: 'Lesson and associated content deleted successfully' });
    } catch (error) {
        console.error('Error deleting lesson:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
} 