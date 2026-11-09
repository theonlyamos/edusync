import { NextResponse } from 'next/server';
import { recordsClasses, recordsErrorResponse, requireRecordsActor, todayAtSchool } from '@/lib/school-records.server';

/** The classes the caller keeps records for, and today's date at the school. */
export async function GET() {
  try {
    const guard = await requireRecordsActor();
    if (!guard.ok) return guard.response;
    return NextResponse.json({ classes: await recordsClasses(guard.actor), today: todayAtSchool(guard.actor.school), manager: guard.actor.manager });
  } catch (error) {
    const { body, status } = recordsErrorResponse(error, 'Could not load classes', 'GET /api/records/classes');
    return NextResponse.json(body, { status });
  }
}
