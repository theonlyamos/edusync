import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { connectToDatabase } from '@/lib/db';
import { authOptions } from '@/lib/auth';

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'teacher') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { title, subject, gradeLevel, objectives, content } = await req.json();

        const client = await connectToDatabase();
        const db = client.db();
        const lessonsCollection = db.collection('lessons');

        const lesson = {
            title,
            subject,
            gradeLevel,
            objectives,
            content,
            teacherId: session.user.id,
            teacherName: session.user.name,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        await lessonsCollection.insertOne(lesson);

        return NextResponse.json({ message: 'Lesson created successfully' });
    } catch (error) {
        console.error('Error creating lesson:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
} 