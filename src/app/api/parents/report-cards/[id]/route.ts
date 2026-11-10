import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { parentReportCard } from '@/lib/school-guardians.server';
import { createServerSupabase } from '@/lib/supabase.server';
import { schoolLogoUrl } from '@/lib/school-branding.server';

/** A shared report card of a student the signed-in parent follows. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerSupabase();
    const found = await parentReportCard(supabase, session.user.id, (await params).id);
    if (!found) return NextResponse.json({ error: 'Report card not found' }, { status: 404 });
    const logoUrl = await schoolLogoUrl(supabase, found.schoolId);
    return NextResponse.json({ card: found.card, schoolLogoUrl: logoUrl }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('[GET /api/parents/report-cards/[id]]', error);
    return NextResponse.json({ error: 'Could not load the report card' }, { status: 500 });
  }
}
