import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase.server';
import { parseSchoolDetails, schoolSetupSteps } from '@/lib/school-registration';
import { getActiveSchoolMembership as findMembership, schoolHasPurchasedCredits } from '@/lib/school-access.server';

type Supabase = ReturnType<typeof createServerSupabase>;

async function countMembers(supabase: Supabase, schoolId: string, role: 'teacher' | 'student') {
  const { count, error } = await supabase
    .from('organization_members')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', schoolId)
    .eq('role', role)
    .eq('is_active', true);
  if (error) throw error;
  return count ?? 0;
}

export async function GET() {
  try {
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerSupabase();
    const membership = await findMembership(supabase, session.user.id);
    if (!membership) {
      return NextResponse.json({ school: null });
    }

    const { school, role } = membership;
    const isManager = role === 'owner' || role === 'admin';
    if (!isManager) {
      return NextResponse.json({ school: { id: school.id, name: school.name }, role });
    }

    const [teacherCount, studentCount, purchased] = await Promise.all([
      countMembers(supabase, school.id, 'teacher'),
      countMembers(supabase, school.id, 'student'),
      schoolHasPurchasedCredits(supabase, school),
    ]);
    const steps = schoolSetupSteps({
      hasDetails: Boolean(school.country && school.timezone),
      gradeCount: school.grade_levels?.length ?? 0,
      teacherCount,
      studentCount,
      hasPurchasedCredits: purchased,
    });

    return NextResponse.json({
      school: {
        id: school.id,
        name: school.name,
        description: school.description ?? null,
        country: school.country,
        timezone: school.timezone,
        gradeLevels: school.grade_levels ?? [],
        setupDismissedAt: school.setup_dismissed_at,
      },
      role,
      isOwner: school.owner_id === session.user.id,
      setup: { steps, teacherCount, studentCount },
    });
  } catch (error) {
    console.error('Error in GET /api/schools/current:', error);
    return NextResponse.json({ error: 'Failed to load school' }, { status: 500 });
  }
}

/** Update the caller's school details. Owners and school admins only. */
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
    const parsed = parseSchoolDetails(body, { partial: true });
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const supabase = createServerSupabase();
    const membership = await findMembership(supabase, session.user.id);
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Only school owners and admins can change school details' }, { status: 403 });
    }

    const update: Record<string, unknown> = {};
    if (parsed.value.name !== undefined) update.name = parsed.value.name;
    if (body.description !== undefined) {
      const description = typeof body.description === 'string' ? body.description.trim() : '';
      if (description.length > 500) {
        return NextResponse.json({ error: 'Description must be 500 characters or fewer.' }, { status: 400 });
      }
      update.description = description || null;
    }
    if (parsed.value.country !== undefined) update.country = parsed.value.country;
    if (parsed.value.timezone !== undefined) update.timezone = parsed.value.timezone;
    if (parsed.value.gradeLevels !== undefined) update.grade_levels = parsed.value.gradeLevels;
    if (typeof body.setupDismissed === 'boolean') {
      update.setup_dismissed_at = body.setupDismissed ? new Date().toISOString() : null;
    }
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    const { error } = await supabase
      .from('organizations')
      .update(update)
      .eq('id', membership.school.id)
      .eq('type', 'school');
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error in PATCH /api/schools/current:', error);
    return NextResponse.json({ error: 'Failed to update school' }, { status: 500 });
  }
}
