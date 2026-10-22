import { NextResponse } from 'next/server';
import { z } from 'zod';
import { lessonArtifactErrorResponse, LessonArtifactHttpError, requireLessonManager } from '@/lib/lesson-artifacts/server';
import { LESSON_RESOURCE_BUCKET, validateResourceFile } from '@/lib/lesson-resources';

const schema = z.object({
    lessonId: z.string().uuid(),
    filename: z.string().min(1).max(255),
    mimeType: z.string().max(200).optional().default(''),
    size: z.number().int().positive(),
});

/**
 * Issues a one-time signed upload URL so the browser sends the file straight to
 * storage (Vercel functions can't take large request bodies). The resource row is
 * only created by POST /api/resources once the upload has landed.
 */
export async function POST(req: Request) {
    try {
        const parsed = schema.safeParse(await req.json().catch(() => null));
        if (!parsed.success) throw new LessonArtifactHttpError(400, 'Choose a file to upload');
        const input = parsed.data;
        let extension: string;
        try {
            extension = validateResourceFile(input.filename, input.mimeType, input.size);
        } catch (error) {
            throw new LessonArtifactHttpError(400, (error as Error).message);
        }
        const { supabase: db } = await requireLessonManager(input.lessonId);
        const path = `${input.lessonId}/${crypto.randomUUID()}.${extension}`;
        const { data, error } = await db.storage.from(LESSON_RESOURCE_BUCKET).createSignedUploadUrl(path);
        if (error) throw error;
        return NextResponse.json({ path: data.path, token: data.token, signedUrl: data.signedUrl });
    } catch (error) {
        return lessonArtifactErrorResponse(error);
    }
}
