import { NextResponse } from 'next/server';
import { z } from 'zod';
import { lessonArtifactErrorResponse, LessonArtifactHttpError, requireLessonManager } from '@/lib/lesson-artifacts/server';
import { requireLessonViewer } from '@/lib/lesson-artifacts/lesson-read-server';
import { listManagedLessons } from '@/lib/lesson-content-server';
import { RESOURCE_COLUMNS } from '@/lib/lesson-resources-server';
import {
    LESSON_RESOURCE_BUCKET,
    mapLessonResource,
    normalizeResourceUrl,
    resourceMimeType,
    validateResourceFile,
    type LessonResourceRow,
} from '@/lib/lesson-resources';

export async function GET(req: Request) {
    try {
        const lessonId = new URL(req.url).searchParams.get('lessonId');
        if (lessonId) {
            const { supabase } = await requireLessonViewer(lessonId);
            const { data, error } = await supabase
                .from('lesson_resources')
                .select(RESOURCE_COLUMNS)
                .eq('lesson_id', lessonId)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return NextResponse.json(((data ?? []) as LessonResourceRow[]).map(mapLessonResource));
        }

        // No lesson given: the teacher's resources across all their lessons.
        const { db, lessons } = await listManagedLessons();
        if (lessons.length === 0) return NextResponse.json([]);
        const titles = new Map(lessons.map((lesson) => [lesson.id, lesson.title]));
        const { data, error } = await db
            .from('lesson_resources')
            .select(RESOURCE_COLUMNS)
            .in('lesson_id', [...titles.keys()])
            .order('created_at', { ascending: false })
            .limit(500);
        if (error) throw error;
        return NextResponse.json(((data ?? []) as LessonResourceRow[]).map((row) => ({
            ...mapLessonResource(row),
            lessonTitle: titles.get(row.lesson_id),
        })));
    } catch (error) {
        return lessonArtifactErrorResponse(error);
    }
}

const createSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('url'),
        lessonId: z.string().uuid(),
        title: z.string().trim().min(1, 'Add a title').max(200),
        description: z.string().max(2000).optional().default(''),
        url: z.string().min(1, 'Add a link'),
    }),
    z.object({
        type: z.literal('file'),
        lessonId: z.string().uuid(),
        title: z.string().trim().min(1, 'Add a title').max(200),
        description: z.string().max(2000).optional().default(''),
        path: z.string().min(1),
        filename: z.string().min(1).max(255),
        mimeType: z.string().max(200).optional().default(''),
        size: z.number().int().positive(),
    }),
]);

export async function POST(req: Request) {
    let input: z.infer<typeof createSchema>;
    try {
        const parsed = createSchema.safeParse(await req.json().catch(() => null));
        if (!parsed.success) {
            throw new LessonArtifactHttpError(400, parsed.error.issues[0]?.message ?? 'Invalid resource');
        }
        input = parsed.data;
    } catch (error) {
        return lessonArtifactErrorResponse(error);
    }
    try {
        // Only the lesson's teacher (or an admin) may add resources; the insert bypasses RLS.
        const { supabase: db, session, lesson } = await requireLessonManager(input.lessonId);
        const base = {
            lesson_id: input.lessonId,
            organization_id: lesson.organization_id ?? null,
            title: input.title,
            description: input.description.trim(),
            created_by: session.user.id,
        };
        let row;
        if (input.type === 'url') {
            let url: string;
            try {
                url = normalizeResourceUrl(input.url);
            } catch (error) {
                throw new LessonArtifactHttpError(400, (error as Error).message);
            }
            row = { ...base, kind: 'link', url };
        } else {
            try {
                validateResourceFile(input.filename, input.mimeType, input.size);
            } catch (error) {
                throw new LessonArtifactHttpError(400, (error as Error).message);
            }
            // The path must be one this server issued for this lesson, and the upload must have landed.
            const prefix = `${input.lessonId}/`;
            const name = input.path.slice(prefix.length);
            if (!input.path.startsWith(prefix) || !/^[0-9a-f-]{36}\.[a-z0-9]+$/i.test(name)) {
                throw new LessonArtifactHttpError(400, 'Upload the file again');
            }
            const { data: objects, error: listError } = await db.storage
                .from(LESSON_RESOURCE_BUCKET)
                .list(input.lessonId, { search: name, limit: 1 });
            if (listError) throw listError;
            const uploaded = objects?.find((object) => object.name === name);
            if (!uploaded) throw new LessonArtifactHttpError(400, 'The file did not finish uploading. Try again.');
            const storedSize = Number((uploaded.metadata as { size?: number } | null)?.size ?? input.size);
            row = {
                ...base,
                kind: 'file',
                storage_path: input.path,
                filename: input.filename.slice(0, 255),
                mime_type: resourceMimeType(input.filename, input.mimeType),
                byte_size: storedSize > 0 ? storedSize : input.size,
            };
        }
        const { data, error } = await db.from('lesson_resources').insert(row).select(RESOURCE_COLUMNS).single();
        if (error) throw error;
        return NextResponse.json(mapLessonResource(data as LessonResourceRow), { status: 201 });
    } catch (error) {
        return lessonArtifactErrorResponse(error);
    }
}
