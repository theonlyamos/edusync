import { NextResponse, NextRequest } from 'next/server';
import { z } from 'zod';
import { gradeSubmission, mapResult, type AssessmentResultRow } from '@/lib/assessments';
import { AssessmentHttpError, assessmentErrorResponse, getAssessmentActor, loadAssessment } from '@/lib/assessments-server';

const submissionSchema = z.object({
    answers: z.array(z.object({ questionId: z.string().max(80), answer: z.string().max(5000) })).max(200),
    startedAt: z.string().optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const actor = await getAssessmentActor();
        if (actor.role !== 'student') throw new AssessmentHttpError(403, 'Only students can submit assessments');
        const { row } = await loadAssessment(actor, (await params).id);
        if (row.due_date && new Date(row.due_date).getTime() < Date.now()) {
            throw new AssessmentHttpError(409, 'This assessment is past its due date');
        }
        const input = submissionSchema.parse(await req.json().catch(() => null));

        const { data: existing, error: existingError } = await actor.db
            .from('assessment_results')
            .select('id')
            .eq('assessment_id', row.id)
            .eq('student_id', actor.userId)
            .limit(1);
        if (existingError) throw existingError;
        if (existing?.length) throw new AssessmentHttpError(409, 'You have already submitted this assessment');

        const { graded, totalScore, percentage } = gradeSubmission(row.questions, input.answers);
        const status = percentage >= row.passingscore ? 'passed' : 'failed';
        const submittedAt = new Date();
        const started = input.startedAt ? new Date(input.startedAt) : submittedAt;
        const startedAt = Number.isNaN(started.getTime()) || started > submittedAt ? submittedAt : started;
        const timeSpent = Math.max(0, Math.round((submittedAt.getTime() - startedAt.getTime()) / 60000));

        const { data, error } = await actor.db
            .from('assessment_results')
            .insert({
                assessment_id: row.id,
                student_id: actor.userId,
                answers: graded,
                score: totalScore,
                percentage,
                status,
                startedat: startedAt.toISOString(),
                submittedat: submittedAt.toISOString(),
                timespent: timeSpent,
            })
            .select('*')
            .single();
        if (error) throw error;
        return NextResponse.json({
            result: mapResult(data as AssessmentResultRow, { name: actor.session.user.name, email: actor.session.user.email }),
            message: `You ${status} with ${percentage.toFixed(1)}%`,
        });
    } catch (error) {
        return assessmentErrorResponse(error, 'Failed to submit assessment');
    }
}
