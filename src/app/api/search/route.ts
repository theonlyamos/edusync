import { NextRequest, NextResponse } from 'next/server';
import { requireSchoolRole } from '@/lib/school-access.server';
import { cleanSearchQuery } from '@/lib/search';
import { searchSchool } from '@/lib/search.server';

/** Jump-to search for teachers and school administrators: ?q=text&portal=school|teacher. */
export async function GET(request: NextRequest) {
  try {
    const guard = await requireSchoolRole(['owner', 'admin', 'teacher']);
    if (!guard.ok) return guard.response;
    const { supabase, membership, userId } = guard.context;
    const text = cleanSearchQuery(request.nextUrl.searchParams.get('q'));
    if (!text) return NextResponse.json({ results: [] });
    const portal = request.nextUrl.searchParams.get('portal') === 'school' ? 'school' : 'teacher';
    return NextResponse.json({ results: await searchSchool(supabase, { userId, membership }, text, portal) });
  } catch (error) {
    console.error('[GET /api/search]', error);
    return NextResponse.json({ error: 'Search is unavailable right now' }, { status: 500 });
  }
}
