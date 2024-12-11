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

        const stats = await db.collection('studentStats').findOne(
            { studentId: session.user.id }
        ) || {
            studentId: session.user.id,
            totalExercisesCompleted: 0,
            totalPointsEarned: 0,
            recentScores: [],
            currentStreak: 0,
            averageScore: 0
        };

        // Calculate average score from recent scores
        const averageScore = stats.recentScores.length > 0
            ? Math.round(stats.recentScores.reduce((a: number, b: number) => a + b, 0) / stats.recentScores.length)
            : 0;

        return NextResponse.json({
            ...stats,
            averageScore
        });
    } catch (error) {
        console.error('Error fetching practice stats:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
} 