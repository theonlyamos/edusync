import { NextRequest, NextResponse } from 'next/server';
import { listAssignments, listSubjects } from '@/lib/school-subjects.server';
import { GRADE_LEVELS } from '@/lib/constants';
import { requireSchoolRole, SCHOOL_MANAGER_ROLES, type ServiceSupabase } from '@/lib/school-access.server';
import { normalizeGradeLevel } from '@/lib/school-people';
import { classLabel } from '@/lib/school-classes';
import { isUuid } from '@/lib/school-classes.server';
import { gradeLevelLabel } from '@/lib/school-registration';
import { findTeacherClashes, readTimetable, validateTimetable, type Timetable } from '@/lib/timetable';

/** Active teachers in the school, for the timetable's teacher picker. */
async function schoolTeachers(supabase: ServiceSupabase, schoolId: string) {
  const { data, error } = await supabase
    .from('organization_members')
    .select('user_id, users!organization_members_user_id_fkey(name, email)')
    .eq('organization_id', schoolId)
    .eq('role', 'teacher')
    .eq('is_active', true);
  if (error) throw error;
  return (data ?? [])
    .map((row: any) => {
      const user = Array.isArray(row.users) ? row.users[0] : row.users;
      return { id: row.user_id as string, name: (user?.name || user?.email || 'Teacher') as string };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function schoolGrades(gradeLevels: string[] | null): string[] {
  return gradeLevels?.length ? gradeLevels : [...GRADE_LEVELS];
}

type ClassRow = { id: string; grade: string; name: string };

async function schoolClasses(supabase: ServiceSupabase, schoolId: string): Promise<ClassRow[]> {
  const { data, error } = await supabase.from('school_classes').select('id, grade, name').eq('organization_id', schoolId).limit(2000);
  if (error) throw error;
  return ((data ?? []) as ClassRow[]).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

/** The stored timetable for a grade (classId null) or one class. */
async function findTimetable(supabase: ServiceSupabase, schoolId: string, grade: string, classId: string | null) {
  let query = supabase
    .from('timetables')
    .select('id, periods, schedule, updated_at')
    .eq('organization_id', schoolId)
    .eq('grade', grade);
  query = classId ? query.eq('class_id', classId) : query.is('class_id', null);
  const { data, error } = await query.order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

/** Every other timetable in the school, to warn about a teacher booked twice. */
async function otherTimetables(supabase: ServiceSupabase, schoolId: string, grade: string, classId: string | null, classes: ClassRow[]) {
  const { data, error } = await supabase.from('timetables').select('grade, class_id, periods, schedule').eq('organization_id', schoolId);
  if (error) throw error;
  const names = new Map(classes.map((c) => [c.id, c]));
  return (data ?? [])
    .filter((row: any) => !(row.grade === grade && (row.class_id ?? null) === classId))
    .map((row: any) => {
      const c = row.class_id ? names.get(row.class_id) : null;
      return { label: c ? classLabel(gradeLevelLabel(c.grade), c.name) : gradeLevelLabel(row.grade), timetable: readTimetable(row) };
    });
}

async function clashesFor(supabase: ServiceSupabase, schoolId: string, grade: string, classId: string | null, classes: ClassRow[], timetable: Timetable, teachers: Array<{ id: string; name: string }>) {
  const names = new Map(teachers.map((t) => [t.id, t.name]));
  return findTeacherClashes(timetable, await otherTimetables(supabase, schoolId, grade, classId, classes))
    .map((c) => ({ ...c, teacherName: names.get(c.teacherId) ?? 'A teacher' }));
}

/**
 * GET ?grade=primary 4[&class=<id>] → the school's grades, classes and teachers,
 * and that grade's (or class's) timetable.
 */
export async function GET(request: NextRequest) {
  try {
    const guard = await requireSchoolRole(SCHOOL_MANAGER_ROLES);
    if (!guard.ok) return guard.response;
    const { supabase, membership } = guard.context;
    const school = membership.school;

    const grades = schoolGrades(school.grade_levels);
    const [teachers, classes, subjects, assignments] = await Promise.all([
      schoolTeachers(supabase, school.id),
      schoolClasses(supabase, school.id),
      listSubjects(supabase, school.id),
      listAssignments(supabase, school.id),
    ]);
    const requested = request.nextUrl.searchParams.get('grade');
    if (!requested) return NextResponse.json({ grades, teachers, classes, subjects, assignments });

    const grade = normalizeGradeLevel(requested);
    if (!grade || !grades.includes(grade)) {
      return NextResponse.json({ error: 'That grade is not one of your school’s grades' }, { status: 400 });
    }
    const classParam = request.nextUrl.searchParams.get('class');
    const classId = classParam && isUuid(classParam) && classes.some((c) => c.id === classParam && c.grade === grade) ? classParam : null;
    if (classParam && !classId) return NextResponse.json({ error: 'That class is not in this grade' }, { status: 400 });

    const data = await findTimetable(supabase, school.id, grade, classId);
    const timetable = readTimetable(data);
    const clashes = await clashesFor(supabase, school.id, grade, classId, classes, timetable, teachers);
    return NextResponse.json({ grades, teachers, classes, subjects, assignments, grade, classId, timetable, clashes, updatedAt: data?.updated_at ?? null });
  } catch (error) {
    console.error('Error in GET /api/schools/current/timetables:', error);
    return NextResponse.json({ error: 'Failed to load the timetable' }, { status: 500 });
  }
}

/** PUT { grade, classId?, periods, schedule } saves one grade's (or class's) whole timetable. */
export async function PUT(request: NextRequest) {
  try {
    const guard = await requireSchoolRole(SCHOOL_MANAGER_ROLES);
    if (!guard.ok) return guard.response;
    const { supabase, membership } = guard.context;
    const school = membership.school;

    const body = await request.json().catch(() => null);
    const grade = normalizeGradeLevel(body?.grade);
    if (!grade || !schoolGrades(school.grade_levels).includes(grade)) {
      return NextResponse.json({ error: 'That grade is not one of your school’s grades' }, { status: 400 });
    }
    const [teachers, classes] = await Promise.all([schoolTeachers(supabase, school.id), schoolClasses(supabase, school.id)]);
    const classId = body?.classId ? String(body.classId) : null;
    if (classId && !classes.some((c) => c.id === classId && c.grade === grade)) {
      return NextResponse.json({ error: 'That class is not in this grade' }, { status: 400 });
    }
    const checked = validateTimetable(body, new Set(teachers.map((t) => t.id)));
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });

    const now = new Date().toISOString();
    const existing = await findTimetable(supabase, school.id, grade, classId);

    const values = { periods: checked.value.periods, schedule: checked.value.schedule, updated_at: now };
    const { error } = existing
      ? await supabase.from('timetables').update(values).eq('id', existing.id)
      : await supabase.from('timetables').insert({ ...values, grade, class_id: classId, organization_id: school.id, isactive: true });
    if (error) throw error;

    const clashes = await clashesFor(supabase, school.id, grade, classId, classes, checked.value, teachers);
    return NextResponse.json({ grade, classId, timetable: checked.value, clashes, updatedAt: now });
  } catch (error) {
    console.error('Error in PUT /api/schools/current/timetables:', error);
    return NextResponse.json({ error: 'Failed to save the timetable' }, { status: 500 });
  }
}
