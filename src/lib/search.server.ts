import 'server-only';
import { isSchoolManager, type SchoolMembership, type ServiceSupabase } from '@/lib/school-access.server';
import { gradeLevelLabel } from '@/lib/school-registration';
import { likePattern, SEARCH_GROUP_LIMIT, type SearchResult } from '@/lib/search';

type Viewer = { userId: string; membership: SchoolMembership };

const one = <T,>(value: T | T[] | null | undefined): T | undefined => (Array.isArray(value) ? value[0] : value ?? undefined);

/** Active people in the school with this role whose name or email matches. */
async function people(supabase: ServiceSupabase, schoolId: string, role: 'student' | 'teacher', pattern: string) {
  const { data, error } = await supabase
    .from('organization_members')
    // Members point at users twice (the person and who invited them), so name the link.
    .select('user_id, users!organization_members_user_id_fkey!inner(name, email)')
    .eq('organization_id', schoolId)
    .eq('role', role)
    .eq('is_active', true)
    .or(`name.ilike.${quoted(pattern)},email.ilike.${quoted(pattern)}`, { referencedTable: 'users' })
    .limit(SEARCH_GROUP_LIMIT);
  if (error) throw error;
  return (data ?? []).map((row) => {
    const user = one(row.users as { name: string | null; email: string | null } | { name: string | null; email: string | null }[]);
    return { id: row.user_id as string, name: user?.name || user?.email || 'Unnamed', email: user?.email ?? '' };
  });
}

/** A value inside a PostgREST `or(...)` filter must be double-quoted to keep its commas, dots and brackets literal. */
const quoted = (value: string) => `"${value.replace(/["\\]/g, (char) => `\\${char}`)}"`;

async function lessons(supabase: ServiceSupabase, pattern: string, scope: { schoolId: string } | { teacherRecordId: string }) {
  let query = supabase.from('lessons').select('id, title, subject, gradelevel').ilike('title', pattern).is('archived_at', null);
  query = 'schoolId' in scope ? query.eq('organization_id', scope.schoolId) : query.eq('teacher_id', scope.teacherRecordId);
  const { data, error } = await query.order('updated_at', { ascending: false }).limit(SEARCH_GROUP_LIMIT);
  if (error) throw error;
  return data ?? [];
}

const lessonDetail = (row: { subject?: unknown; gradelevel?: unknown }) =>
  [row.subject, row.gradelevel ? gradeLevelLabel(String(row.gradelevel)) : ''].filter(Boolean).join(' · ');

/** What a school administrator can jump to: people, classes and lessons in their school. */
async function managerSearch(supabase: ServiceSupabase, schoolId: string, pattern: string, text: string): Promise<SearchResult[]> {
  const [students, teachers, classes, schoolLessons] = await Promise.all([
    people(supabase, schoolId, 'student', pattern),
    people(supabase, schoolId, 'teacher', pattern),
    supabase.from('school_classes').select('id, name, grade').eq('organization_id', schoolId).ilike('name', pattern).order('grade').limit(SEARCH_GROUP_LIMIT),
    lessons(supabase, pattern, { schoolId }),
  ]);
  if (classes.error) throw classes.error;
  const find = (name: string) => encodeURIComponent(name || text);
  return [
    ...students.map((p): SearchResult => ({ kind: 'student', id: p.id, title: p.name, detail: p.email, href: `/school/students?q=${find(p.name)}` })),
    ...teachers.map((p): SearchResult => ({ kind: 'teacher', id: p.id, title: p.name, detail: p.email, href: `/school/teachers?q=${find(p.name)}` })),
    ...(classes.data ?? []).map((c): SearchResult => ({ kind: 'class', id: c.id as string, title: `${gradeLevelLabel(String(c.grade))} ${c.name}`, detail: 'Class', href: `/school/classes/${c.id}` })),
    ...schoolLessons.map((l): SearchResult => ({ kind: 'lesson', id: l.id as string, title: String(l.title), detail: lessonDetail(l), href: `/school/lessons?q=${find(String(l.title))}` })),
  ];
}

/** What a teacher can jump to: students in their school, and their own lessons and homework. */
async function teacherSearch(supabase: ServiceSupabase, viewer: Viewer, pattern: string): Promise<SearchResult[]> {
  const schoolId = viewer.membership.school.id;
  const { data: teacher, error: teacherError } = await supabase.from('teachers').select('id').eq('user_id', viewer.userId).maybeSingle();
  if (teacherError) throw teacherError;
  const [students, own, homework] = await Promise.all([
    people(supabase, schoolId, 'student', pattern),
    teacher?.id ? lessons(supabase, pattern, { teacherRecordId: teacher.id as string }) : Promise.resolve([]),
    supabase
      .from('homeworks')
      .select('id, title, subject, lesson_title')
      .eq('owner_id', viewer.userId)
      .eq('organization_id', schoolId)
      .neq('status', 'archived')
      .ilike('title', pattern)
      .order('created_at', { ascending: false })
      .limit(SEARCH_GROUP_LIMIT),
  ]);
  if (homework.error) throw homework.error;
  return [
    ...students.map((p): SearchResult => ({ kind: 'student', id: p.id, title: p.name, detail: 'Student', href: `/teachers/students/${p.id}` })),
    ...own.map((l): SearchResult => ({ kind: 'lesson', id: l.id as string, title: String(l.title), detail: lessonDetail(l), href: `/teachers/lessons/${l.id}` })),
    ...(homework.data ?? []).map((h): SearchResult => ({ kind: 'homework', id: h.id as string, title: String(h.title), detail: [h.subject, h.lesson_title].filter(Boolean).join(' · '), href: `/teachers/homework/${h.id}` })),
  ];
}

/**
 * Finds people, classes, lessons and homework by name for the signed-in school
 * member. Each role only searches what its own pages already show it.
 */
export async function searchSchool(supabase: ServiceSupabase, viewer: Viewer, text: string, portal: 'school' | 'teacher'): Promise<SearchResult[]> {
  const pattern = likePattern(text);
  const role = viewer.membership.role;
  if (portal === 'school' && isSchoolManager(role)) return managerSearch(supabase, viewer.membership.school.id, pattern, text);
  if (role === 'teacher') return teacherSearch(supabase, viewer, pattern);
  return [];
}
