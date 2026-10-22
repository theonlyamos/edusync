import { NextResponse } from 'next/server';
import { createSSRUserSupabase } from '@/lib/supabase.server';
import { nextPracticeStatsRow, practiceAnswerIsCorrect, practiceStatsFromRow } from '@/lib/practice-stats';

interface Answer {
    questionId: string;
    answer: string | string[];
}

interface Question {
    id: string;
    type?: string;
    correctAnswer: string | string[];
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
        if (!Array.isArray(answers) || !Array.isArray(questions) || !questions.length || !subject || !topic) {
            return NextResponse.json({ message: 'Missing practice answers' }, { status: 400 });
        }
        const studentAnswers = answers as Answer[];
        const exerciseQuestions = (questions as Question[]).slice(0, 20);

        // Calculate score
        let totalPoints = 0;
        let earnedPoints = 0;
        const results = exerciseQuestions.map(question => {
            const points = Math.min(Math.max(Number(question.points) || 1, 1), 5);
            const studentAnswer = studentAnswers.find(a => a.questionId === question.id);
            const isCorrect = practiceAnswerIsCorrect(studentAnswer?.answer, question.correctAnswer);
            totalPoints += points;
            if (isCorrect) earnedPoints += points;

            return {
                questionId: question.id,
                isCorrect,
                points: isCorrect ? points : 0,
                explanation: question.explanation
            };
        });

        const score = {
            earnedPoints,
            totalPoints,
            percentage: totalPoints ? Math.round((earnedPoints / totalPoints) * 100) : 0
        };

        const completedAt = new Date().toISOString();

        // Save the practice session results
        const { error: insErr } = await supabase
            .from('practice_results')
            .insert({
                student_id: user.id,
                subject: String(subject).slice(0, 200),
                topic: String(topic).slice(0, 200),
                score,
                results,
                completedat: completedAt,
            });
        if (insErr) throw insErr;

        const { data: currentRow, error: statsErr } = await supabase
            .from('student_stats')
            .select('studentid,totalexercisescompleted,totalpointsearned,recentscores,lastpracticedate')
            .eq('studentid', user.id)
            .maybeSingle();
        if (statsErr) throw statsErr;

        const nextRow = nextPracticeStatsRow(
            practiceStatsFromRow(user.id, currentRow),
            score,
            completedAt,
        );
        const { error: saveErr } = currentRow
            ? await supabase.from('student_stats').update(nextRow).eq('studentid', user.id)
            : await supabase.from('student_stats').insert(nextRow);
        if (saveErr) throw saveErr;

        return NextResponse.json({ score, results });
    } catch (error) {
        console.error('Error submitting practice answers:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
