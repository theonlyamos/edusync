import { createServerSupabase } from '@/lib/supabase.server';

export type LessonAudience = { schoolName: string | null; gradeLevel: string; students: number | null };

/**
 * Who a published lesson reaches: students at the lesson's school in its grade
 * (the same rule /api/students/lessons uses). Counts only, so the service
 * client is used after the caller has been authorized for the lesson.
 */
export async function lessonAudience(lesson: { organization_id: string | null; gradelevel: string | null }): Promise<LessonAudience> {
  const gradeLevel = lesson.gradelevel ?? '';
  if (!lesson.organization_id || !gradeLevel) return { schoolName: null, gradeLevel, students: null };
  const db = createServerSupabase();
  const [school, students] = await Promise.all([
    db.from('organizations').select('name').eq('id', lesson.organization_id).maybeSingle(),
    db.from('students').select('id', { count: 'exact', head: true }).eq('organization_id', lesson.organization_id).eq('grade', gradeLevel),
  ]);
  if (school.error) throw school.error;
  if (students.error) throw students.error;
  return { schoolName: school.data?.name ?? null, gradeLevel, students: students.count ?? 0 };
}
