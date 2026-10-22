import 'server-only';

import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getServerSession } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase.server';
import { getUserSchoolId, inActiveSchool } from '@/lib/school';
import type { AssessmentRow } from '@/lib/assessments';

export class AssessmentHttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function assessmentErrorResponse(error: unknown, fallback = 'Something went wrong with this assessment') {
  if (error instanceof AssessmentHttpError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof ZodError) return NextResponse.json({ error: error.issues[0]?.message ?? 'Invalid assessment' }, { status: 400 });
  console.error(fallback, error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export const ASSESSMENT_COLUMNS =
  'id,title,description,subject,gradelevel,type,duration,totalpoints,passingscore,questions,createdby,created_at,updated_at,is_published,due_date,lesson_id,organization_id';

/**
 * Who is asking, with their school and (for students) grade. All assessment
 * routes use the service client after this, so these checks are the only gate.
 */
export async function getAssessmentActor() {
  const session = await getServerSession();
  if (!session?.user?.id) throw new AssessmentHttpError(401, 'Sign in to see assessments');
  const role = session.user.role ?? '';
  if (!['admin', 'teacher', 'student'].includes(role)) throw new AssessmentHttpError(403, 'Assessments are for schools');
  const db = createServerSupabase();
  const schoolId = role === 'admin' ? null : await getUserSchoolId(db, session.user.id);
  let grade: string | null = null;
  if (role === 'student') {
    const { data, error } = await db.from('students').select('grade').eq('user_id', session.user.id).maybeSingle();
    if (error) throw error;
    grade = data?.grade?.trim().toLowerCase() ?? null;
  }
  return { session, db, userId: session.user.id, role: role as 'admin' | 'teacher' | 'student', schoolId, grade };
}
export type AssessmentActor = Awaited<ReturnType<typeof getAssessmentActor>>;

export function canManageAssessment(actor: AssessmentActor, row: Pick<AssessmentRow, 'createdby' | 'organization_id'>) {
  if (actor.role === 'admin') return true;
  return actor.role === 'teacher' && row.createdby === actor.userId && inActiveSchool(actor.schoolId, row.organization_id);
}

export function canViewAssessment(actor: AssessmentActor, row: AssessmentRow) {
  if (actor.role === 'admin') return true;
  if (!inActiveSchool(actor.schoolId, row.organization_id)) return false;
  if (actor.role === 'teacher') return true;
  return Boolean(row.is_published) && Boolean(actor.grade) && row.gradelevel?.trim().toLowerCase() === actor.grade;
}

export async function loadAssessment(actor: AssessmentActor, id: string, need: 'view' | 'manage' = 'view') {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new AssessmentHttpError(404, 'Assessment not found');
  const { data, error } = await actor.db.from('assessments').select(ASSESSMENT_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw error;
  const row = data as AssessmentRow | null;
  // Hide assessments the caller can't see, so ids from other schools don't leak.
  if (!row || !canViewAssessment(actor, row)) throw new AssessmentHttpError(404, 'Assessment not found');
  const canManage = canManageAssessment(actor, row);
  if (need === 'manage' && !canManage) throw new AssessmentHttpError(403, 'Only the teacher who made this assessment can change it');
  return { row, canManage };
}

export async function userNames(db: AssessmentActor['db'], ids: (string | null | undefined)[]) {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return new Map<string, { name: string | null; email: string | null }>();
  const { data, error } = await db.from('users').select('id,name,email').in('id', unique);
  if (error) throw error;
  return new Map((data ?? []).map((user) => [user.id as string, { name: user.name as string | null, email: user.email as string | null }]));
}
