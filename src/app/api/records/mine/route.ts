import { NextResponse } from 'next/server';
import { emptyAttendance, shiftDay } from '@/lib/school-records';
import { attendanceTotals, recordsErrorResponse, requireRecordsActor, studentReportCards, todayAtSchool } from '@/lib/school-records.server';

/** A student's own published report cards and their attendance over the last 90 days. */
export async function GET() {
  try {
    const guard = await requireRecordsActor(['student']);
    if (!guard.ok) return guard.response;
    const { actor } = guard;
    const today = todayAtSchool(actor.school);
    const [cards, attendance] = await Promise.all([
      studentReportCards(actor.supabase, actor.school.id, actor.userId),
      attendanceTotals(actor.supabase, actor.school.id, [actor.userId], shiftDay(today, -90), today),
    ]);
    return NextResponse.json({ cards, attendance: attendance.get(actor.userId) ?? emptyAttendance() }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const { body, status } = recordsErrorResponse(error, 'Could not load your records', 'GET /api/records/mine');
    return NextResponse.json(body, { status });
  }
}
