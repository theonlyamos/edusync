import { NextResponse, NextRequest } from 'next/server';
import { assessmentColumns, assessmentInputSchema, mapAssessment, type AssessmentRow } from '@/lib/assessments';
import {
    ASSESSMENT_COLUMNS,
    AssessmentHttpError,
    assessmentErrorResponse,
    getAssessmentActor,
    loadAssessment,
    userNames,
} from '@/lib/assessments-server';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
    try {
        const actor = await getAssessmentActor();
        const { row, canManage } = await loadAssessment(actor, (await params).id);
        const creators = await userNames(actor.db, [row.createdby]);
        return NextResponse.json(mapAssessment(row, {
            // Only the author (or an admin) sees the answer key.
            includeAnswers: canManage,
            creator: row.createdby ? creators.get(row.createdby) : null,
        }));
    } catch (error) {
        return assessmentErrorResponse(error, 'Failed to fetch assessment');
    }
}

// Update an assessment. Send { isPublished } alone to publish or unpublish.
export async function PUT(req: NextRequest, { params }: Params) {
    try {
        const actor = await getAssessmentActor();
        const { row } = await loadAssessment(actor, (await params).id, 'manage');
        const body = await req.json().catch(() => null) as Record<string, unknown> | null;
        if (!body) throw new AssessmentHttpError(400, 'Send the assessment changes');
        let update: Record<string, unknown>;
        if (Object.keys(body).length === 1 && typeof body.isPublished === 'boolean') {
            update = { is_published: body.isPublished };
        } else {
            const input = assessmentInputSchema.parse(body);
            try {
                update = assessmentColumns(input);
            } catch (error) {
                throw new AssessmentHttpError(400, (error as Error).message);
            }
            const { count, error: countError } = await actor.db
                .from('assessment_results')
                .select('id', { count: 'exact', head: true })
                .eq('assessmentid', row.id);
            if (countError) throw countError;
            // Changing questions after students submit would make their marks wrong.
            if ((count ?? 0) > 0) throw new AssessmentHttpError(409, 'Students have already submitted this assessment, so its questions can no longer change');
        }
        const { data, error } = await actor.db
            .from('assessments')
            .update(update)
            .eq('id', row.id)
            .select(ASSESSMENT_COLUMNS)
            .single();
        if (error) throw error;
        const creators = await userNames(actor.db, [row.createdby]);
        return NextResponse.json(mapAssessment(data as AssessmentRow, {
            includeAnswers: true,
            creator: row.createdby ? creators.get(row.createdby) : null,
        }));
    } catch (error) {
        return assessmentErrorResponse(error, 'Failed to update assessment');
    }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
    try {
        const actor = await getAssessmentActor();
        const { row } = await loadAssessment(actor, (await params).id, 'manage');
        const { error } = await actor.db.from('assessments').delete().eq('id', row.id);
        if (error) throw error;
        return NextResponse.json({ message: 'Assessment deleted successfully' });
    } catch (error) {
        return assessmentErrorResponse(error, 'Failed to delete assessment');
    }
}
