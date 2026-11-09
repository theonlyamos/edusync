import { NextResponse } from 'next/server';
import { listCalendar } from '@/lib/school-calendar.server';
import { recordsClasses, recordsErrorResponse, requireRecordsActor, todayAtSchool } from '@/lib/school-records.server';

/** The classes the caller keeps records for, the school calendar, and today's date at the school. */
export async function GET() {
  try {
    const guard = await requireRecordsActor();
    if (!guard.ok) return guard.response;
    const { actor } = guard;
    const [classes, calendar] = await Promise.all([recordsClasses(actor), listCalendar(actor.supabase, actor.school.id)]);
    return NextResponse.json({ classes, calendar, today: todayAtSchool(actor.school), manager: actor.manager });
  } catch (error) {
    const { body, status } = recordsErrorResponse(error, 'Could not load classes', 'GET /api/records/classes');
    return NextResponse.json(body, { status });
  }
}
