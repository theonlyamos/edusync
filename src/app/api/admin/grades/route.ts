import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { connectToDatabase } from '@/lib/db';
import { authOptions } from '@/lib/auth';
import { GRADE_LEVELS } from '@/lib/constants';

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'admin') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const client = await connectToDatabase();
        const db = client.db();

        // Get statistics for each grade level
        const gradeStats = await Promise.all(GRADE_LEVELS.map(async (level) => {
            // Count students in this grade
            const studentCount = await db.collection('users').countDocuments({
                role: 'student',
                level
            });

            // Count teachers assigned to this grade
            const teacherCount = await db.collection('users').countDocuments({
                role: 'teacher',
                level
            });

            // Count lessons for this grade
            const lessonCount = await db.collection('lessons').countDocuments({
                gradeLevel: level
            });

            return {
                level,
                studentCount,
                teacherCount,
                lessonCount
            };
        }));

        return NextResponse.json(gradeStats);
    } catch (error) {
        console.error('Error fetching grade statistics:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
} 