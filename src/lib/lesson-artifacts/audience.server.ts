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
  const [school, profiles] = await Promise.all([
    db.from('organizations').select('name').eq('id', lesson.organization_id).maybeSingle(),
    db.from('students').select('user_id').eq('organization_id', lesson.organization_id).eq('grade', gradeLevel),
  ]);
  if (school.error) throw school.error;
  if (profiles.error) throw profiles.error;
  // Deactivated students keep their profile but lose access, so only count active members.
  const userIds = [...new Set((profiles.data ?? []).map((row) => row.user_id).filter(Boolean))];
  let active = 0;
  for (let start = 0; start < userIds.length; start += 100) {
    const { count, error } = await db.from('organization_members').select('user_id', { count: 'exact', head: true })
      .eq('organization_id', lesson.organization_id).eq('is_active', true).in('user_id', userIds.slice(start, start + 100));
    if (error) throw error;
    active += count ?? 0;
  }
  return { schoolName: school.data?.name ?? null, gradeLevel, students: active };
}
