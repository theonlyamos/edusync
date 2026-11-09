import { NextRequest, NextResponse } from 'next/server';
import { buildGradebook, isDay, shiftDay } from '@/lib/school-records';
import { attendanceTotals, classRoster, RecordsError, recordsErrorResponse, requireClass, requireRecordsActor, studentMarks, todayAtSchool } from '@/lib/school-records.server';

/** The marks grid for ?classId= between ?from= and ?to= (default: the last 90 days). */
export async function GET(request: NextRequest) {
  try {
    const guard = await requireRecordsActor();
    if (!guard.ok) return guard.response;
    const { actor } = guard;
    const params = request.nextUrl.searchParams;
    const klass = await requireClass(actor, params.get('classId'));
    const today = todayAtSchool(actor.school);
    const to = params.get('to') ?? today;
    const from = params.get('from') ?? shiftDay(to, -90);
    if (!isDay(from) || !isDay(to) || to < from) throw new RecordsError('Pick a valid period');
    if (Date.parse(to) - Date.parse(from) > 370 * 24 * 60 * 60 * 1000) throw new RecordsError('Pick a period of a year or less');
    const roster = await classRoster(actor.supabase, actor.school.id, klass.id);
    const ids = roster.map((student) => student.studentId);
    const [marks, attendance] = await Promise.all([
      studentMarks(actor.supabase, actor.school.id, ids, from, to),
      attendanceTotals(actor.supabase, actor.school.id, ids, from, to),
    ]);
    return NextResponse.json({ class: klass, from, to, gradebook: buildGradebook(roster, marks), attendance: Object.fromEntries(attendance) });
  } catch (error) {
    const { body, status } = recordsErrorResponse(error, 'Could not load the gradebook', 'GET /api/records/gradebook');
    return NextResponse.json(body, { status });
  }
}
