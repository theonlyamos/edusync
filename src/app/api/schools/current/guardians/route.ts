import { NextRequest, NextResponse } from 'next/server';
import { appOrigin } from '@/lib/app-origin';
import { isEmailConfigured } from '@/lib/email';
import { requireSchoolRole, SCHOOL_MANAGER_ROLES } from '@/lib/school-access.server';
import { addGuardian, listSchoolGuardians, parseNewGuardian } from '@/lib/school-guardians.server';
import { listSchoolPeople, peopleErrorResponse } from '@/lib/school-people.server';

/** The school's parents, and the active students a parent can be added for. */
export async function GET() {
  try {
    const guard = await requireSchoolRole(SCHOOL_MANAGER_ROLES);
    if (!guard.ok) return guard.response;
    const { supabase, membership } = guard.context;
    const [guardians, students] = await Promise.all([
      listSchoolGuardians(supabase, membership.school.id),
      listSchoolPeople(supabase, membership.school.id, 'student'),
    ]);
    return NextResponse.json({
      guardians,
      students: students.filter((s) => s.isActive).map((s) => ({ userId: s.userId, name: s.name, gradeLevel: s.gradeLevel ?? null, className: s.schoolClass?.name ?? null })),
      emailConfigured: isEmailConfigured(),
    });
  } catch (error) {
    const { body, status } = peopleErrorResponse(error, 'Failed to load parents', 'GET /api/schools/current/guardians');
    return NextResponse.json(body, { status });
  }
}

/** Adds a parent for a student: { name, email, studentId }. */
export async function POST(request: NextRequest) {
  try {
    const guard = await requireSchoolRole(SCHOOL_MANAGER_ROLES);
    if (!guard.ok) return guard.response;
    const { supabase, membership, userId, userName } = guard.context;
    const input = parseNewGuardian(await request.json().catch(() => null));
    const result = await addGuardian({ supabase, school: membership.school, actor: { id: userId, name: userName }, origin: appOrigin(request) }, input);
    return NextResponse.json({ ...result, email: input.email }, { status: 201 });
  } catch (error) {
    const { body, status } = peopleErrorResponse(error, 'Failed to add the parent', 'POST /api/schools/current/guardians');
    return NextResponse.json(body, { status });
  }
}
