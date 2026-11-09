import { NextRequest, NextResponse } from 'next/server';
import {
  generateReportCards,
  listClassReportCards,
  publishClassReportCards,
  recordsErrorResponse,
  reportTerms,
  requireClass,
  requireRecordsActor,
  requireReportPeriod,
} from '@/lib/school-records.server';

/** Report cards for ?classId=: the terms that have them, and the cards of ?term= (default: the newest term). */
export async function GET(request: NextRequest) {
  try {
    const guard = await requireRecordsActor();
    if (!guard.ok) return guard.response;
    const { actor } = guard;
    const klass = await requireClass(actor, request.nextUrl.searchParams.get('classId'));
    const all = await listClassReportCards(actor.supabase, actor.school.id, klass.id);
    const terms = reportTerms(all);
    const term = request.nextUrl.searchParams.get('term') || terms[0]?.term || null;
    return NextResponse.json({ class: klass, terms, term, cards: term ? all.filter((card) => card.term === term) : [] });
  } catch (error) {
    const { body, status } = recordsErrorResponse(error, 'Could not load report cards', 'GET /api/records/report-cards');
    return NextResponse.json(body, { status });
  }
}

/**
 * { classId, term, periodStart, periodEnd } makes or refreshes the class's cards.
 * { classId, term, publish: true } publishes the ones not yet published.
 */
export async function POST(request: NextRequest) {
  try {
    const guard = await requireRecordsActor();
    if (!guard.ok) return guard.response;
    const { actor } = guard;
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const klass = await requireClass(actor, body?.classId);
    if (body?.publish === true) {
      const term = typeof body.term === 'string' ? body.term.trim() : '';
      if (!term) return NextResponse.json({ error: 'Pick a term' }, { status: 400 });
      const published = await publishClassReportCards(actor, klass.id, term);
      return NextResponse.json({ published, cards: await listClassReportCards(actor.supabase, actor.school.id, klass.id, term) });
    }
    const period = requireReportPeriod(body ?? {});
    return NextResponse.json({ term: period.term, cards: await generateReportCards(actor, klass, period) }, { status: 201 });
  } catch (error) {
    const { body, status } = recordsErrorResponse(error, 'Could not make the report cards', 'POST /api/records/report-cards');
    return NextResponse.json(body, { status });
  }
}
