import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { isGuardian, parentChildren } from '@/lib/school-guardians.server';
import { createServerSupabase } from '@/lib/supabase.server';

/**
 * The students the signed-in parent follows, with attendance, marks and
 * shared report cards. ?check=1 only says whether they follow anyone.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerSupabase();
    const headers = { 'Cache-Control': 'private, no-store' };
    if (request.nextUrl.searchParams.get('check')) return NextResponse.json({ parent: await isGuardian(supabase, session.user.id) }, { headers });
    return NextResponse.json({ children: await parentChildren(supabase, session.user.id) }, { headers });
  } catch (error) {
    console.error('[GET /api/parents/me]', error);
    return NextResponse.json({ error: 'Could not load your children’s records' }, { status: 500 });
  }
}
