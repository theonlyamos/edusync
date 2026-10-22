import { NextResponse, NextRequest } from 'next/server';
import { lessonArtifactErrorResponse, LessonArtifactHttpError } from '@/lib/lesson-artifacts/server';
import { requireContentManager } from '@/lib/lesson-content-server';

type Params = { params: Promise<{ contentId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
    try {
        const { row } = await requireContentManager((await params).contentId, 'content');
        return NextResponse.json(row);
    } catch (error) {
        return lessonArtifactErrorResponse(error);
    }
}

export async function PUT(req: NextRequest, { params }: Params) {
    try {
        const { db, row } = await requireContentManager((await params).contentId, 'content');
        const body = await req.json().catch(() => null);
        if (!body || typeof body !== 'object' || !('content' in body)) {
            throw new LessonArtifactHttpError(400, 'Send the updated content');
        }
        const { data, error } = await db
            .from('lesson_content')
            .update({ content: body.content })
            .eq('id', row.id)
            .select('*')
            .single();
        if (error) throw error;
        return NextResponse.json(data);
    } catch (error) {
        return lessonArtifactErrorResponse(error);
    }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
    try {
        const { db, row } = await requireContentManager((await params).contentId, 'content');
        const { error } = await db.from('lesson_content').delete().eq('id', row.id);
        if (error) throw error;
        return NextResponse.json({ message: 'Content deleted' });
    } catch (error) {
        return lessonArtifactErrorResponse(error);
    }
}
