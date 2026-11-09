import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ATTENDANCE_STATUSES } from '@/lib/school-records';
import { getRegister, recordsErrorResponse, requireClass, requireRecordsActor, requireRegisterDay, saveRegister } from '@/lib/school-records.server';

/** The register for ?classId= on ?day= (YYYY-MM-DD). */
export async function GET(request: NextRequest) {
  try {
    const guard = await requireRecordsActor();
    if (!guard.ok) return guard.response;
    const { actor } = guard;
    const klass = await requireClass(actor, request.nextUrl.searchParams.get('classId'));
    const day = requireRegisterDay(request.nextUrl.searchParams.get('day'), actor.school);
    return NextResponse.json(await getRegister(actor.supabase, actor.school.id, klass.id, day));
  } catch (error) {
    const { body, status } = recordsErrorResponse(error, 'Could not load the register', 'GET /api/records/attendance');
    return NextResponse.json(body, { status });
  }
}

const saveSchema = z.object({
  classId: z.string().uuid(),
  day: z.string(),
  entries: z
    .array(z.object({ studentId: z.string().uuid(), status: z.enum(ATTENDANCE_STATUSES), note: z.string().max(300).nullish() }))
    .min(1)
    .max(1000),
});

/** Saves marks for a class on a day. Returns the register as it now stands. */
export async function PUT(request: NextRequest) {
  try {
    const guard = await requireRecordsActor();
    if (!guard.ok) return guard.response;
    const { actor } = guard;
    const parsed = saveSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Check the register and try again' }, { status: 400 });
    const klass = await requireClass(actor, parsed.data.classId);
    const day = requireRegisterDay(parsed.data.day, actor.school);
    await saveRegister(actor, klass.id, day, parsed.data.entries);
    return NextResponse.json(await getRegister(actor.supabase, actor.school.id, klass.id, day));
  } catch (error) {
    const { body, status } = recordsErrorResponse(error, 'Could not save the register', 'PUT /api/records/attendance');
    return NextResponse.json(body, { status });
  }
}
