import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { connectToDatabase } from '@/lib/db';
import { authOptions } from '@/lib/auth';

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'teacher') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const client = await connectToDatabase();
        const db = client.db();
        const lessonsCollection = db.collection('lessons');

        const lessons = await lessonsCollection
            .find({ teacherId: session.user.id })
            .sort({ createdAt: -1 })
            .toArray();

        return NextResponse.json(lessons);
    } catch (error) {
        console.error('Error fetching lessons:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
} 