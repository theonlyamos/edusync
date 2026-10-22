import { NextResponse } from 'next/server';
import { assessmentColumns, assessmentInputSchema, mapAssessment, type AssessmentRow } from '@/lib/assessments';
import {
    ASSESSMENT_COLUMNS,
    AssessmentHttpError,
    assessmentErrorResponse,
    getAssessmentActor,
    userNames,
} from '@/lib/assessments-server';

// Create an assessment (teachers and admins).
export async function POST(req: Request) {
    try {
        const actor = await getAssessmentActor();
        if (actor.role === 'student') throw new AssessmentHttpError(403, 'Only teachers can create assessments');
        if (actor.role === 'teacher' && !actor.schoolId) throw new AssessmentHttpError(403, 'Join a school before creating assessments');
        const input = assessmentInputSchema.parse(await req.json().catch(() => null));
        let columns;
        try {
            columns = assessmentColumns(input);
        } catch (error) {
            throw new AssessmentHttpError(400, (error as Error).message);
        }
        const { data, error } = await actor.db
            .from('assessments')
            .insert({
                ...columns,
                is_published: input.isPublished ?? false,
                createdby: actor.userId,
                organization_id: actor.schoolId,
            })
            .select(ASSESSMENT_COLUMNS)
            .single();
        if (error) throw error;
        const creator = { name: actor.session.user.name, email: actor.session.user.email };
        return NextResponse.json(mapAssessment(data as AssessmentRow, { includeAnswers: true, creator }), { status: 201 });
    } catch (error) {
        return assessmentErrorResponse(error, 'Failed to create assessment');
    }
}

// List assessments: a teacher's own, a student's published ones for their grade, or all (admin).
export async function GET(req: Request) {
    try {
        const actor = await getAssessmentActor();
        const { searchParams } = new URL(req.url);
        const subject = searchParams.get('subject');
        const gradeLevel = searchParams.get('gradeLevel');
        const type = searchParams.get('type');

        let query = actor.db.from('assessments').select(ASSESSMENT_COLUMNS);
        if (actor.role === 'teacher') {
            if (!actor.schoolId) return NextResponse.json([]);
            query = query.eq('createdby', actor.userId).eq('organization_id', actor.schoolId);
        } else if (actor.role === 'student') {
            if (!actor.schoolId || !actor.grade) return NextResponse.json([]);
            query = query.eq('organization_id', actor.schoolId).eq('is_published', true).ilike('gradelevel', actor.grade);
        }
        if (subject) query = query.eq('subject', subject);
        if (gradeLevel) query = query.eq('gradelevel', gradeLevel);
        if (type) query = query.eq('type', type);
        const { data, error } = await query.order('created_at', { ascending: false }).limit(200);
        if (error) throw error;
        const rows = (data ?? []) as AssessmentRow[];

        let mine = new Map<string, { status: string | null; percentage: number }>();
        if (actor.role === 'student' && rows.length) {
            const { data: results, error: resultError } = await actor.db
                .from('assessment_results')
                .select('assessmentid,status,percentage')
                .eq('studentid', actor.userId)
                .in('assessmentid', rows.map((row) => row.id));
            if (resultError) throw resultError;
            mine = new Map((results ?? []).map((r) => [r.assessmentid as string, { status: r.status as string | null, percentage: Number(r.percentage ?? 0) }]));
        }
        const creators = await userNames(actor.db, rows.map((row) => row.createdby));
        return NextResponse.json(rows.map((row) => mapAssessment(row, {
            includeAnswers: actor.role !== 'student',
            creator: row.createdby ? creators.get(row.createdby) : null,
            ...(actor.role === 'student' ? { myResult: mine.get(row.id) ?? null } : {}),
        })));
    } catch (error) {
        return assessmentErrorResponse(error, 'Failed to fetch assessments');
    }
}
