import { NextRequest, NextResponse } from 'next/server';
import { requireSchoolRole, SCHOOL_MANAGER_ROLES } from '@/lib/school-access.server';

type Params = { params: Promise<{ memberId: string }> };

/**
 * Deactivate or reactivate someone in the caller's school: { isActive }.
 * Their lessons, homework and history stay; they just lose access.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const guard = await requireSchoolRole(SCHOOL_MANAGER_ROLES);
    if (!guard.ok) return guard.response;
    const { supabase, membership, userId } = guard.context;
    const { memberId } = await params;

    const body = await request.json().catch(() => null);
    if (typeof body?.isActive !== 'boolean') {
      return NextResponse.json({ error: 'Say whether the member should be active' }, { status: 400 });
    }

    const { data: member, error: lookupError } = await supabase
      .from('organization_members')
      .select('id, user_id, role')
      .eq('id', memberId)
      .eq('organization_id', membership.school.id)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    if (member.role === 'owner') {
      return NextResponse.json({ error: 'The school owner cannot be deactivated' }, { status: 409 });
    }
    if (member.user_id === userId) {
      return NextResponse.json({ error: 'You cannot deactivate yourself' }, { status: 409 });
    }
    if (member.role === 'admin' && membership.role !== 'owner') {
      return NextResponse.json({ error: 'Only the school owner can change other admins' }, { status: 403 });
    }

    // Teacher and student access also follows users.role (portals and the
    // service-role routes check it), so a deactivated teacher or student drops
    // to a plain learner account and gets their role back on reactivation.
    const portalRole = member.role === 'teacher' || member.role === 'student' ? member.role : null;
    const setAppRole = async (role: string) => {
      const { error } = await supabase.from('users').update({ role }).eq('id', member.user_id);
      if (error) throw error;
    };

    if (!body.isActive && portalRole) await setAppRole('learner');
    const { error } = await supabase
      .from('organization_members')
      .update({ is_active: body.isActive })
      .eq('id', member.id);
    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'This person has joined another school since' }, { status: 409 });
      }
      throw error;
    }
    if (body.isActive && portalRole) await setAppRole(portalRole);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error in PATCH /api/schools/current/members/[memberId]:', error);
    return NextResponse.json({ error: 'Failed to update member' }, { status: 500 });
  }
}
