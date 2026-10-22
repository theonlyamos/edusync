import { NextResponse, NextRequest } from 'next/server';
import { lessonArtifactErrorResponse } from '@/lib/lesson-artifacts/server';
import { requireResourceManager, requireResourceViewer } from '@/lib/lesson-resources-server';
import { LESSON_RESOURCE_BUCKET, mapLessonResource } from '@/lib/lesson-resources';

type Params = { params: Promise<{ resourceId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
    try {
        const { row } = await requireResourceViewer((await params).resourceId);
        return NextResponse.json(mapLessonResource(row));
    } catch (error) {
        return lessonArtifactErrorResponse(error);
    }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
    try {
        const { db, row } = await requireResourceManager((await params).resourceId);
        const { error } = await db.from('lesson_resources').delete().eq('id', row.id);
        if (error) throw error;
        if (row.storage_path) {
            // The row is gone either way; a leftover file is unreachable, so don't fail the request.
            const { error: removeError } = await db.storage.from(LESSON_RESOURCE_BUCKET).remove([row.storage_path]);
            if (removeError) console.error('Failed to remove resource file', row.storage_path, removeError);
        }
        return NextResponse.json({ message: 'Resource deleted' });
    } catch (error) {
        return lessonArtifactErrorResponse(error);
    }
}
