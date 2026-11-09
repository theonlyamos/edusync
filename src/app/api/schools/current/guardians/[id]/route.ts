import { NextRequest, NextResponse } from 'next/server';
import { appOrigin } from '@/lib/app-origin';
import { requireSchoolRole, SCHOOL_MANAGER_ROLES } from '@/lib/school-access.server';
import { removeGuardianLink, resendGuardianLink } from '@/lib/school-guardians.server';
import { peopleErrorResponse } from '@/lib/school-people.server';

type Params = { params: Promise<{ id: string }> };

/** Sends the parent (id = their account) a fresh activation or password link. */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const guard = await requireSchoolRole(SCHOOL_MANAGER_ROLES);
    if (!guard.ok) return guard.response;
    const { supabase, membership, userId, userName } = guard.context;
    const link = await resendGuardianLink({ supabase, school: membership.school, actor: { id: userId, name: userName }, origin: appOrigin(request) }, (await params).id);
    return NextResponse.json(link);
  } catch (error) {
    const { body, status } = peopleErrorResponse(error, 'Failed to send the link', 'POST /api/schools/current/guardians/[id]');
    return NextResponse.json(body, { status });
  }
}

/** Stops a parent following one student (id = that link). */
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const guard = await requireSchoolRole(SCHOOL_MANAGER_ROLES);
    if (!guard.ok) return guard.response;
    await removeGuardianLink(guard.context.supabase, guard.context.membership.school, (await params).id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const { body, status } = peopleErrorResponse(error, 'Failed to remove the parent', 'DELETE /api/schools/current/guardians/[id]');
    return NextResponse.json(body, { status });
  }
}
