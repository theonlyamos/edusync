import { NextRequest, NextResponse } from 'next/server';
import { requireSchoolRole, SCHOOL_MANAGER_ROLES } from '@/lib/school-access.server';
import { appOrigin, resendSchoolInvite } from '@/lib/school-invites.server';

type Params = { params: Promise<{ inviteId: string }> };

/** Send an open invite again with a fresh link. */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const guard = await requireSchoolRole(SCHOOL_MANAGER_ROLES);
    if (!guard.ok) return guard.response;
    const { supabase, membership, userId, userName } = guard.context;
    const { inviteId } = await params;

    const result = await resendSchoolInvite(
      { supabase, school: membership.school, inviter: { id: userId, name: userName }, origin: appOrigin(request) },
      inviteId,
    );
    if (!result) {
      return NextResponse.json({ error: 'This invite was already accepted or cancelled' }, { status: 409 });
    }
    return NextResponse.json({ result });
  } catch (error) {
    console.error('Error in POST /api/schools/current/invites/[inviteId]:', error);
    return NextResponse.json({ error: 'Failed to resend invite' }, { status: 500 });
  }
}

/** Cancel an open invite so its link stops working. */
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const guard = await requireSchoolRole(SCHOOL_MANAGER_ROLES);
    if (!guard.ok) return guard.response;
    const { supabase, membership } = guard.context;
    const { inviteId } = await params;

    const { data, error } = await supabase
      .from('organization_invitations')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', inviteId)
      .eq('organization_id', membership.school.id)
      .is('accepted_at', null)
      .is('revoked_at', null)
      .select('id');
    if (error) throw error;
    if (!data?.length) {
      return NextResponse.json({ error: 'This invite was already accepted or cancelled' }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error in DELETE /api/schools/current/invites/[inviteId]:', error);
    return NextResponse.json({ error: 'Failed to cancel invite' }, { status: 500 });
  }
}
