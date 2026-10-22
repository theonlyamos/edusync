import { NextResponse } from 'next/server';
import { requireLessonViewer } from '@/lib/lesson-artifacts/lesson-read-server';
import { lessonArtifactErrorResponse, LessonArtifactHttpError, requireLessonManager } from '@/lib/lesson-artifacts/server';
import { LESSON_CONTENT_TYPES, listManagedLessons, mapLessonContent } from '@/lib/lesson-content-server';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const lessonId = searchParams.get('lessonId');
        const type = searchParams.get('type');
        if (type && !(LESSON_CONTENT_TYPES as readonly string[]).includes(type)) {
            throw new LessonArtifactHttpError(400, `type must be one of ${LESSON_CONTENT_TYPES.join(', ')}`);
        }

        if (lessonId) {
            const { supabase } = await requireLessonViewer(lessonId);
            let query = supabase.from('lesson_content').select('*').eq('lesson_id', lessonId);
            if (type) query = query.eq('type', type);
            const { data, error } = await query.order('created_at', { ascending: false });
            if (error) throw error;
            return NextResponse.json((data ?? []).map((row) => mapLessonContent(row)));
        }

        // No lesson given: the teacher's content library across all their lessons.
        const { db, lessons } = await listManagedLessons();
        if (lessons.length === 0) return NextResponse.json([]);
        const titles = new Map(lessons.map((lesson) => [lesson.id, lesson.title]));
        let query = db.from('lesson_content').select('*').in('lesson_id', [...titles.keys()]);
        if (type) query = query.eq('type', type);
        const { data, error } = await query.order('created_at', { ascending: false }).limit(500);
        if (error) throw error;
        return NextResponse.json((data ?? []).map((row) => mapLessonContent(row, titles.get(row.lesson_id))));
    } catch (error) {
        return lessonArtifactErrorResponse(error);
    }
}

export async function POST(req: Request) {
    try {
        const payload = await req.json().catch(() => null) as { lessonId?: unknown; type?: unknown; content?: unknown } | null;
        const lessonId = typeof payload?.lessonId === 'string' ? payload.lessonId : '';
        const type = typeof payload?.type === 'string' ? payload.type : '';
        if (!lessonId) throw new LessonArtifactHttpError(400, 'lessonId is required');
        if (!(LESSON_CONTENT_TYPES as readonly string[]).includes(type)) {
            throw new LessonArtifactHttpError(400, `type must be one of ${LESSON_CONTENT_TYPES.join(', ')}`);
        }
        // Only the lesson's teacher (or an admin) may add content; the insert below bypasses RLS.
        const { supabase } = await requireLessonManager(lessonId);
        const { data, error } = await supabase
            .from('lesson_content')
            .insert({ lesson_id: lessonId, type, content: payload?.content ?? {}, created_at: new Date().toISOString() })
            .select('*')
            .single();
        if (error) throw error;
        return NextResponse.json(mapLessonContent(data));
    } catch (error) {
        return lessonArtifactErrorResponse(error);
    }
}
