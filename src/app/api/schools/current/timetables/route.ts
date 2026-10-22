import { NextRequest, NextResponse } from 'next/server';
import { GRADE_LEVELS } from '@/lib/constants';
import { requireSchoolRole, SCHOOL_MANAGER_ROLES, type ServiceSupabase } from '@/lib/school-access.server';
import { normalizeGradeLevel } from '@/lib/school-people';
import { readTimetable, validateTimetable } from '@/lib/timetable';

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

/** GET ?grade=primary 4 → the school's grades, its teachers and that grade's timetable. */
export async function GET(request: NextRequest) {
  try {
    const guard = await requireSchoolRole(SCHOOL_MANAGER_ROLES);
    if (!guard.ok) return guard.response;
    const { supabase, membership } = guard.context;
    const school = membership.school;

    const grades = schoolGrades(school.grade_levels);
    const teachers = await schoolTeachers(supabase, school.id);
    const requested = request.nextUrl.searchParams.get('grade');
    if (!requested) return NextResponse.json({ grades, teachers });

    const grade = normalizeGradeLevel(requested);
    if (!grade || !grades.includes(grade)) {
      return NextResponse.json({ error: 'That grade is not one of your school’s grades' }, { status: 400 });
    }
    const { data, error } = await supabase
      .from('timetables')
      .select('periods, schedule, updated_at')
      .eq('organization_id', school.id)
      .eq('grade', grade)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;

    return NextResponse.json({ grades, teachers, grade, timetable: readTimetable(data), updatedAt: data?.updated_at ?? null });
  } catch (error) {
    console.error('Error in GET /api/schools/current/timetables:', error);
    return NextResponse.json({ error: 'Failed to load the timetable' }, { status: 500 });
  }
}

/** PUT { grade, periods, schedule } saves one grade's whole timetable. */
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
    const teachers = await schoolTeachers(supabase, school.id);
    const checked = validateTimetable(body, new Set(teachers.map((t) => t.id)));
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });

    const now = new Date().toISOString();
    const { data: existing, error: findError } = await supabase
      .from('timetables')
      .select('id')
      .eq('organization_id', school.id)
      .eq('grade', grade)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (findError) throw findError;

    const values = { periods: checked.value.periods, schedule: checked.value.schedule, updated_at: now };
    const { error } = existing
      ? await supabase.from('timetables').update(values).eq('id', existing.id)
      : await supabase.from('timetables').insert({ ...values, grade, organization_id: school.id, isactive: true });
    if (error) throw error;

    return NextResponse.json({ grade, timetable: checked.value, updatedAt: now });
  } catch (error) {
    console.error('Error in PUT /api/schools/current/timetables:', error);
    return NextResponse.json({ error: 'Failed to save the timetable' }, { status: 500 });
  }
}
