import { NextResponse, NextRequest } from 'next/server';
import { lessonArtifactErrorResponse, LessonArtifactHttpError } from '@/lib/lesson-artifacts/server';
import { requireResourceViewer } from '@/lib/lesson-resources-server';
import { LESSON_RESOURCE_BUCKET } from '@/lib/lesson-resources';

type Params = { params: Promise<{ resourceId: string }> };

/** Checks the viewer may open the lesson, then redirects to a short-lived signed file URL. */
export async function GET(_req: NextRequest, { params }: Params) {
    try {
        const { db, row } = await requireResourceViewer((await params).resourceId);
        if (row.kind !== 'file' || !row.storage_path) throw new LessonArtifactHttpError(404, 'This resource is a link, not a file');
        const inline = /^(application\/pdf|image\/|audio\/|video\/|text\/plain)/.test(row.mime_type ?? '');
        const { data, error } = await db.storage
            .from(LESSON_RESOURCE_BUCKET)
            .createSignedUrl(row.storage_path, 300, { download: inline ? false : (row.filename ?? true) });
        if (error) throw error;
        return NextResponse.redirect(data.signedUrl, { status: 302, headers: { 'Cache-Control': 'private, no-store' } });
    } catch (error) {
        return lessonArtifactErrorResponse(error);
    }
}
