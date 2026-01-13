import { NextResponse } from 'next/server';
import { createSSRUserSupabase } from '@/lib/supabase.server';

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
        const supabase = await createSSRUserSupabase();
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        // Verify user is a student
        const { data: userData } = await supabase
            .from('users')
            .select('role')
            .eq('id', user.id)
            .maybeSingle();

        if (!userData || userData.role !== 'student') {
            return new NextResponse('Unauthorized - Student access required', { status: 403 });
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
        const { error: insErr } = await supabase
            .from('practice_results')
            .insert({
                studentId: user.id,
                subject,
                topic,
                score,
                results,
                completedAt: new Date().toISOString(),
            });
        if (insErr) throw insErr;

        // First, get the current student stats
        const { data: currentStatsRaw } = await supabase
            .from('student_stats')
            .select('*')
            .eq('studentId', user.id)
            .maybeSingle();
        const currentStats = currentStatsRaw || {
            studentId: user.id,
            totalExercisesCompleted: 0,
            totalPointsEarned: 0,
            recentScores: [] as number[]
        };

        // Update the recent scores array
        const recentScores = [...currentStats.recentScores, score.percentage].slice(-10);

        // Update student's practice statistics
        const upsertPayload = {
            studentId: user.id,
            totalExercisesCompleted: (currentStats.totalExercisesCompleted ?? 0) + 1,
            totalPointsEarned: (currentStats.totalPointsEarned ?? 0) + earnedPoints,
            recentScores,
            lastPracticeDate: new Date().toISOString()
        } as any;
        if (currentStatsRaw) {
            const { error } = await supabase
                .from('student_stats')
                .update(upsertPayload)
                .eq('studentId', user.id);
            if (error) throw error;
        } else {
            const { error } = await supabase
                .from('student_stats')
                .insert(upsertPayload);
            if (error) throw error;
        }

        return NextResponse.json({ score, results });
    } catch (error) {
        console.error('Error submitting practice answers:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
