import { createServerSupabase } from '@/lib/supabase.server';

export type AudienceClass = { id: string; name: string; students: number };

export type LessonAudience = {
  schoolName: string | null;
  gradeLevel: string;
  students: number | null;
  /** The grade's classes the teacher can pick from. */
  classes: AudienceClass[];
  /** The classes it is set for. Empty means the whole grade. */
  classIds: string[];
};

type Db = ReturnType<typeof createServerSupabase>;

async function activeCount(db: Db, schoolId: string, userIds: string[]): Promise<Set<string>> {
  const active = new Set<string>();
  for (let start = 0; start < userIds.length; start += 100) {
    const { data, error } = await db.from('organization_members').select('user_id')
      .eq('organization_id', schoolId).eq('is_active', true).in('user_id', userIds.slice(start, start + 100));
    if (error) throw error;
    for (const row of data ?? []) active.add(row.user_id as string);
  }
  return active;
}

/** The grade's classes at a school, with how many active students each has. */
export async function gradeClasses(db: Db, schoolId: string, grade: string): Promise<AudienceClass[]> {
  const { data: classes, error } = await db.from('school_classes').select('id, name')
    .eq('organization_id', schoolId).eq('grade', grade).limit(200);
  if (error) throw error;
  if (!classes?.length) return [];
  const { data: members, error: membersError } = await db.from('school_class_students').select('class_id, student_id')
    .in('class_id', classes.map((c) => c.id)).limit(20000);
  if (membersError) throw membersError;
  const active = await activeCount(db, schoolId, [...new Set((members ?? []).map((m) => m.student_id as string))]);
  return classes
    .map((c) => ({
      id: c.id as string,
      name: c.name as string,
      students: (members ?? []).filter((m) => m.class_id === c.id && active.has(m.student_id as string)).length,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
}

/**
 * Keeps only class ids that are classes of this grade at this school.
 * Returns null if any id is not, so the caller can refuse the request.
 */
export async function validAudienceClasses(db: Db, schoolId: string | null, grade: string | null, classIds: string[]): Promise<string[] | null> {
  const ids = [...new Set(classIds)];
  if (ids.length === 0) return [];
  if (!schoolId || !grade) return null;
  const { data, error } = await db.from('school_classes').select('id')
    .eq('organization_id', schoolId).eq('grade', grade).in('id', ids);
  if (error) throw error;
  return (data ?? []).length === ids.length ? ids : null;
}

/**
 * Who a published lesson reaches: students at the lesson's school in its grade,
 * or only in the chosen classes (the same rule /api/students/lessons uses).
 * Counts only, so the service client is used after the caller has been
 * authorized for the lesson.
 */
export async function lessonAudience(lesson: { organization_id: string | null; gradelevel: string | null; audience_class_ids?: string[] | null }): Promise<LessonAudience> {
  const gradeLevel = lesson.gradelevel ?? '';
  if (!lesson.organization_id || !gradeLevel) return { schoolName: null, gradeLevel, students: null, classes: [], classIds: [] };
  const db = createServerSupabase();
  const [school, profiles, classes] = await Promise.all([
    db.from('organizations').select('name').eq('id', lesson.organization_id).maybeSingle(),
    db.from('students').select('user_id').eq('organization_id', lesson.organization_id).eq('grade', gradeLevel),
    gradeClasses(db, lesson.organization_id, gradeLevel),
  ]);
  if (school.error) throw school.error;
  if (profiles.error) throw profiles.error;
  const classIds = (lesson.audience_class_ids ?? []).filter((id) => classes.some((c) => c.id === id));
  let students: number;
  if (classIds.length > 0) {
    students = classes.filter((c) => classIds.includes(c.id)).reduce((sum, c) => sum + c.students, 0);
  } else {
    // Deactivated students keep their profile but lose access, so only count active members.
    const userIds = [...new Set((profiles.data ?? []).map((row) => row.user_id).filter(Boolean))];
    students = (await activeCount(db, lesson.organization_id, userIds)).size;
  }
  return { schoolName: school.data?.name ?? null, gradeLevel, students, classes, classIds };
}
