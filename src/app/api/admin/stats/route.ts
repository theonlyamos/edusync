import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { connectToDatabase } from '@/lib/db';
import { authOptions } from '@/lib/auth';

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'admin') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const client = await connectToDatabase();
        const db = client.db();

        // Get total students
        const totalStudents = await db.collection('users').countDocuments({
            role: 'student'
        });

        // Get total teachers
        const totalTeachers = await db.collection('users').countDocuments({
            role: 'teacher'
        });

        // Get total lessons
        const totalLessons = await db.collection('lessons').countDocuments();

        // Get active users (users who have logged in within the last 24 hours)
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const activeUsers = await db.collection('users').countDocuments({
            lastLogin: { $gte: twentyFourHoursAgo }
        });

        return NextResponse.json({
            totalStudents,
            totalTeachers,
            totalLessons,
            activeUsers
        });
    } catch (error) {
        console.error('Error fetching admin stats:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
} 