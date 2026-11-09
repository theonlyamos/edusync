import { NextRequest, NextResponse } from 'next/server';
import { requireSchoolRole, SCHOOL_MANAGER_ROLES } from '@/lib/school-access.server';
import { removeCalendarEntry, updateCalendarEntry } from '@/lib/school-calendar.server';
import { recordsErrorResponse } from '@/lib/school-records.server';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const guard = await requireSchoolRole(SCHOOL_MANAGER_ROLES);
    if (!guard.ok) return guard.response;
    const { supabase, membership } = guard.context;
    const entry = await updateCalendarEntry(supabase, membership.school.id, (await params).id, await request.json().catch(() => null));
    return NextResponse.json({ entry });
  } catch (error) {
    const { body, status } = recordsErrorResponse(error, 'Could not save the calendar entry', 'PATCH /api/schools/current/calendar/[id]');
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const guard = await requireSchoolRole(SCHOOL_MANAGER_ROLES);
    if (!guard.ok) return guard.response;
    const { supabase, membership } = guard.context;
    await removeCalendarEntry(supabase, membership.school.id, (await params).id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const { body, status } = recordsErrorResponse(error, 'Could not remove the calendar entry', 'DELETE /api/schools/current/calendar/[id]');
    return NextResponse.json(body, { status });
  }
}
