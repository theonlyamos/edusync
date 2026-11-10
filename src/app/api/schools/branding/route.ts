import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase.server';
import { getActiveSchoolMembership, isSchoolManager } from '@/lib/school-access.server';
import { parseBrandingInput } from '@/lib/school-branding';
import { loadSchoolBranding, publicBranding, readRawBranding, saveBranding } from '@/lib/school-branding.server';

/** The caller's school colours, default look and logo. Any member of the school can read them. */
export async function GET() {
  try {
    const session = await getServerSession();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const supabase = createServerSupabase();
    const membership = await getActiveSchoolMembership(supabase, session.user.id);
    if (!membership) return NextResponse.json({ school: null, branding: null });
    const body = await loadSchoolBranding(supabase, membership.school);
    return NextResponse.json(body, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('Error in GET /api/schools/branding:', error);
    return NextResponse.json({ error: 'Failed to load school branding' }, { status: 500 });
  }
}

/** Saves the colours and default look. School owners and admins only; the logo has its own route. */
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const parsed = parseBrandingInput(await request.json().catch(() => null));
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const supabase = createServerSupabase();
    const membership = await getActiveSchoolMembership(supabase, session.user.id);
    if (!membership || !isSchoolManager(membership.role)) {
      return NextResponse.json({ error: 'Only school owners and admins can change branding' }, { status: 403 });
    }
    const current = await readRawBranding(supabase, membership.school.id);
    const next = { ...current, ...parsed.value };
    await saveBranding(supabase, membership.school.id, next);
    return NextResponse.json({ school: { id: membership.school.id, name: membership.school.name }, branding: publicBranding(supabase, next) });
  } catch (error) {
    console.error('Error in PATCH /api/schools/branding:', error);
    return NextResponse.json({ error: 'Failed to save school branding' }, { status: 500 });
  }
}
