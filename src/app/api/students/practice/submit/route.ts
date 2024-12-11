import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { connectToDatabase } from '@/lib/db';
import { authOptions } from '@/lib/auth';
import { ObjectId } from 'mongodb';

interface Answer {
    questionId: string;
    answer: string;
}

interface Question {
    id: string;
    correctAnswer: string;
    points: number;
    explanation: string;
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'student') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { answers, questions, subject, topic } = await req.json();
        const studentAnswers = answers as Answer[];
        const exerciseQuestions = questions as Question[];

        // Calculate score
        let totalPoints = 0;
        let earnedPoints = 0;
        const results = exerciseQuestions.map(question => {
            const studentAnswer = studentAnswers.find(a => a.questionId === question.id);
            const isCorrect = studentAnswer?.answer.toLowerCase() === question.correctAnswer.toLowerCase();
            totalPoints += question.points;
            if (isCorrect) earnedPoints += question.points;

            return {
                questionId: question.id,
                isCorrect,
                points: isCorrect ? question.points : 0,
                explanation: question.explanation
            };
        });

        const score = {
            earnedPoints,
            totalPoints,
            percentage: Math.round((earnedPoints / totalPoints) * 100)
        };

        // Save the practice session results
        const client = await connectToDatabase();
        const db = client.db();

        await db.collection('practiceResults').insertOne({
            studentId: session.user.id,
            subject,
            topic,
            score,
            results,
            completedAt: new Date(),
        });

        // First, get the current student stats
        const currentStats = await db.collection('studentStats').findOne(
            { studentId: session.user.id }
        ) || {
            studentId: session.user.id,
            totalExercisesCompleted: 0,
            totalPointsEarned: 0,
            recentScores: []
        };

        // Update the recent scores array
        const recentScores = [...currentStats.recentScores, score.percentage].slice(-10);

        // Update student's practice statistics
        await db.collection('studentStats').updateOne(
            { studentId: session.user.id },
            {
                $set: {
                    totalExercisesCompleted: currentStats.totalExercisesCompleted + 1,
                    totalPointsEarned: currentStats.totalPointsEarned + earnedPoints,
                    recentScores,
                    lastPracticeDate: new Date()
                }
            },
            { upsert: true }
        );

        return NextResponse.json({ score, results });
    } catch (error) {
        console.error('Error submitting practice answers:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
} 