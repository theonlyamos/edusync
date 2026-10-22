import { NextResponse, NextRequest } from 'next/server';
import { mapResult, resultStatistics, type AssessmentResultRow } from '@/lib/assessments';
import { AssessmentHttpError, assessmentErrorResponse, getAssessmentActor, loadAssessment, userNames } from '@/lib/assessments-server';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const actor = await getAssessmentActor();
        const { row, canManage } = await loadAssessment(actor, (await params).id);

        if (actor.role === 'student') {
            // Students only ever see their own result (null until they submit).
            const { data, error } = await actor.db
                .from('assessment_results')
                .select('*')
                .eq('assessment_id', row.id)
                .eq('student_id', actor.userId)
                .order('submittedat', { ascending: false })
                .limit(1);
            if (error) throw error;
            const result = data?.[0] as AssessmentResultRow | undefined;
            return NextResponse.json(result ? mapResult(result, { name: actor.session.user.name, email: actor.session.user.email }) : null);
        }

        if (!canManage) throw new AssessmentHttpError(403, 'Only the teacher who made this assessment can see its results');
        const { data, error } = await actor.db
            .from('assessment_results')
            .select('*')
            .eq('assessment_id', row.id)
            .order('submittedat', { ascending: false });
        if (error) throw error;
        const rows = (data ?? []) as AssessmentResultRow[];
        const students = await userNames(actor.db, rows.map((r) => r.student_id));
        const results = rows.map((r) => mapResult(r, students.get(r.student_id)));
        return NextResponse.json({ results, statistics: resultStatistics(results) });
    } catch (error) {
        return assessmentErrorResponse(error, 'Failed to fetch assessment results');
    }
}
