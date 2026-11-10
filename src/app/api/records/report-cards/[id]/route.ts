import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { REPORT_COMMENT_MAX } from '@/lib/school-records';
import { schoolLogoUrl } from '@/lib/school-branding.server';
import { readReportCard, recordsErrorResponse, requireRecordsActor, updateReportCard } from '@/lib/school-records.server';

type Params = { params: Promise<{ id: string }> };

/** One report card. Students get their own once it is published. */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const guard = await requireRecordsActor(['owner', 'admin', 'teacher', 'student']);
    if (!guard.ok) return guard.response;
    const card = await readReportCard(guard.actor, (await params).id);
    const logoUrl = await schoolLogoUrl(guard.actor.supabase, guard.actor.school.id);
    return NextResponse.json({ card, schoolLogoUrl: logoUrl }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const { body, status } = recordsErrorResponse(error, 'Could not load the report card', 'GET /api/records/report-cards/[id]');
    return NextResponse.json(body, { status });
  }
}

const patchSchema = z.object({ comment: z.string().max(REPORT_COMMENT_MAX).optional(), published: z.boolean().optional() });

/** Changes the comment or the published state. */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const guard = await requireRecordsActor();
    if (!guard.ok) return guard.response;
    const parsed = patchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: `Keep the comment under ${REPORT_COMMENT_MAX} characters` }, { status: 400 });
    return NextResponse.json({ card: await updateReportCard(guard.actor, (await params).id, parsed.data) });
  } catch (error) {
    const { body, status } = recordsErrorResponse(error, 'Could not save the report card', 'PATCH /api/records/report-cards/[id]');
    return NextResponse.json(body, { status });
  }
}
