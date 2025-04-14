import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { connectToDatabase } from '@/lib/db';
import { Progress } from '@/lib/models/Progress';
import { authOptions } from '@/lib/auth';

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await connectToDatabase();
        const progress = await Progress.find({ 
            studentId: session.user.id 
        }).populate('lessonId');

        return NextResponse.json(progress);
    } catch (error) {
        console.error('Error fetching progress:', error);
        return NextResponse.json(
            { error: 'Failed to fetch progress' },
            { status: 500 }
        );
    }
}

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { lessonId, completionStatus, timeSpent, quizScore } = await request.json();

        await connectToDatabase();
        const progress = await Progress.findOneAndUpdate(
            { 
                studentId: session.user.id,
                lessonId 
            },
            {
                $set: {
                    completionStatus,
                    timeSpent,
                    lastAccessed: new Date()
                },
                $push: quizScore ? {
                    quizScores: {
                        quizId: quizScore.quizId,
                        score: quizScore.score,
                        attemptDate: new Date()
                    }
                } : undefined
            },
            { 
                new: true,
                upsert: true 
            }
        );

        return NextResponse.json(progress);
    } catch (error) {
        console.error('Error updating progress:', error);
        return NextResponse.json(
            { error: 'Failed to update progress' },
            { status: 500 }
        );
    }
}