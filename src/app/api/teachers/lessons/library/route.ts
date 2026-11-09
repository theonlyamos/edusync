import { NextRequest, NextResponse } from 'next/server';
import { copyLesson, LessonLibraryError, listLibraryLessons } from '@/lib/lesson-library.server';
import { requireSchoolRole } from '@/lib/school-access.server';

const fail = (error: unknown, fallback: string, where: string) => {
  if (error instanceof LessonLibraryError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error(`[${where}]`, error);
  return NextResponse.json({ error: fallback }, { status: 500 });
};

/** Published lessons by the caller's colleagues at their school. */
export async function GET() {
  try {
    const guard = await requireSchoolRole(['teacher']);
    if (!guard.ok) return guard.response;
    const { supabase, membership, userId } = guard.context;
    return NextResponse.json({ lessons: await listLibraryLessons(supabase, membership.school.id, userId) });
  } catch (error) {
    return fail(error, 'Could not load the school library', 'GET /api/teachers/lessons/library');
  }
}

/** Copies a lesson into the caller's own drafts: { lessonId }. */
export async function POST(request: NextRequest) {
  try {
    const guard = await requireSchoolRole(['teacher']);
    if (!guard.ok) return guard.response;
    const { supabase, membership, userId } = guard.context;
    const body = (await request.json().catch(() => null)) as { lessonId?: unknown } | null;
    const copy = await copyLesson(supabase, { userId, schoolId: membership.school.id }, typeof body?.lessonId === 'string' ? body.lessonId : '');
    return NextResponse.json(copy, { status: 201 });
  } catch (error) {
    return fail(error, 'Could not copy the lesson', 'POST /api/teachers/lessons/library');
  }
}
