import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { connectToDatabase } from '@/lib/db';
import { authOptions } from '@/lib/auth';

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'student') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const client = await connectToDatabase();
        const db = client.db();

        // For now, return all lessons since we haven't implemented lesson assignment yet
        // TODO: Add lesson assignment functionality and filter by assigned lessons
        const lessons = await db.collection('lessons')
            .find({})
            .sort({ createdAt: -1 })
            .toArray();

        return NextResponse.json(lessons);
    } catch (error) {
        console.error('Error fetching student lessons:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
} 