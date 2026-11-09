import { NextRequest, NextResponse } from 'next/server';
import { isSchoolManager, requireSchoolRole, SCHOOL_MANAGER_ROLES } from '@/lib/school-access.server';
import { addCalendarEntry, listCalendar } from '@/lib/school-calendar.server';
import { recordsErrorResponse, todayAtSchool } from '@/lib/school-records.server';

const EVERYONE = ['owner', 'admin', 'teacher', 'student'] as const;

/** The school's calendar, for anyone at the school. */
export async function GET() {
  try {
    const guard = await requireSchoolRole(EVERYONE);
    if (!guard.ok) return guard.response;
    const { supabase, membership } = guard.context;
    return NextResponse.json({
      entries: await listCalendar(supabase, membership.school.id),
      today: todayAtSchool(membership.school),
      canEdit: isSchoolManager(membership.role),
    });
  } catch (error) {
    const { body, status } = recordsErrorResponse(error, 'Could not load the calendar', 'GET /api/schools/current/calendar');
    return NextResponse.json(body, { status });
  }
}

/** Adds an entry: { kind, title, startsOn, endsOn }. */
export async function POST(request: NextRequest) {
  try {
    const guard = await requireSchoolRole(SCHOOL_MANAGER_ROLES);
    if (!guard.ok) return guard.response;
    const { supabase, membership, userId } = guard.context;
    const entry = await addCalendarEntry(supabase, membership.school.id, userId, await request.json().catch(() => null));
    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    const { body, status } = recordsErrorResponse(error, 'Could not save the calendar entry', 'POST /api/schools/current/calendar');
    return NextResponse.json(body, { status });
  }
}
