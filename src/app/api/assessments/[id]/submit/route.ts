import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function POST(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { answers, startedAt } = await req.json();

        // Get the assessment
        const { data: assessment, error: assessErr } = await supabase
            .from('assessments')
            .select('*')
            .eq('id', params.id)
            .maybeSingle();
        if (assessErr) throw assessErr;
        if (!assessment) {
            return NextResponse.json(
                { error: 'Assessment not found' },
                { status: 404 }
            );
        }

        // Check if student has already submitted this assessment
        const { data: existingResult, error: existErr } = await supabase
            .from('assessment_results')
            .select('id')
            .eq('assessmentId', params.id)
            .eq('studentId', session.user.id)
            .maybeSingle();
        if (existErr) throw existErr;

        if (existingResult) {
            return NextResponse.json(
                { error: 'You have already submitted this assessment' },
                { status: 400 }
            );
        }

        // Calculate score and grade answers
        let totalScore = 0;
        const gradedAnswers = answers.map((answer: any) => {
            const question = assessment.questions.find(
                (q: any) => q._id.toString() === answer.questionId
            );

            const isCorrect = question.correctAnswer === answer.answer;
            const points = isCorrect ? question.points : 0;
            totalScore += points;

            return {
                questionId: answer.questionId,
                answer: answer.answer,
                isCorrect,
                points
            };
        });

        const percentage = (totalScore / assessment.totalPoints) * 100;
        const status = percentage >= assessment.passingScore ? 'passed' : 'failed';
        const submittedAt = new Date();
        const timeSpent = Math.round(
            (submittedAt.getTime() - new Date(startedAt).getTime()) / (1000 * 60)
        );

        // Create assessment result
        const { data: result, error } = await supabase
            .from('assessment_results')
            .insert({
                assessmentId: params.id,
                studentId: session.user.id,
                answers: gradedAnswers,
                totalScore,
                percentage,
                status,
                startedAt: new Date(startedAt).toISOString(),
                submittedAt: submittedAt.toISOString(),
                timeSpent
            })
            .select('*')
            .single();
        if (error) throw error;

        return NextResponse.json({
            result,
            message: `Assessment submitted successfully. You ${status} with ${percentage.toFixed(1)}%`
        });
    } catch (error: any) {
        console.error('Error submitting assessment:', error);
        return NextResponse.json(
            { error: 'Failed to submit assessment' },
            { status: 500 }
        );
    }
} 