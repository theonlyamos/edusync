import 'server-only';

import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

import { getServerSession } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase.server';
import { canManageLesson } from './access';
import type { LessonArtifactRecord } from './domain';

export class LessonArtifactHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function requireLessonManager(lessonId: string) {
  const session = await getServerSession();
  if (!session?.user?.id || !['admin', 'teacher'].includes(session.user.role ?? '')) {
    throw new LessonArtifactHttpError(401, 'Teacher or admin access required');
  }

  const supabase = createServerSupabase();
  const { data: lesson, error } = await supabase
    .from('lessons')
    .select('id,title,subject,gradelevel,content,teacher_id,organization_id,current_publication_id')
    .eq('id', lessonId)
    .maybeSingle();
  if (error) throw error;
  if (!lesson) throw new LessonArtifactHttpError(404, 'Lesson not found');

  let normalizedTeacherUserId: string | null = null;
  if (lesson.teacher_id) {
    const { data: teacher } = await supabase
      .from('teachers')
      .select('user_id')
      .eq('id', lesson.teacher_id)
      .maybeSingle();
    normalizedTeacherUserId = teacher?.user_id ?? null;
  }

  if (!canManageLesson({ user: session.user, lesson, normalizedTeacherUserId })) {
    throw new LessonArtifactHttpError(403, 'Not authorized to manage this lesson');
  }

  return { session, supabase, lesson };
}

export function mapArtifactRow(row: any): LessonArtifactRecord {
  return {
    id: row.id,
    lessonId: row.lesson_id,
    objectiveId: row.objective_id,
    seriesId: row.series_id,
    version: row.version,
    objectiveRevision: row.objective_revision,
    supersedesId: row.supersedes_id,
    kind: row.kind,
    status: row.status,
    position: row.position,
    payload: row.payload,
    source: row.source,
  };
}

export function lessonArtifactErrorResponse(error: unknown) {
  if (error instanceof LessonArtifactHttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return NextResponse.json({ error: 'Invalid request', details: error.flatten() }, { status: 400 });
  }
  if (error instanceof Error && error.message.includes('AI_QUOTA_EXCEEDED')) {
    return NextResponse.json({ error: 'Your organization has reached its monthly AI content limit' }, { status: 429 });
  }
  console.error('Lesson artifact request failed:', error);
  return NextResponse.json({ error: 'Lesson artifact request failed' }, { status: 500 });
}
