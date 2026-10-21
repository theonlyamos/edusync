import { NextRequest, NextResponse } from 'next/server';
import { requireSchoolRole, SCHOOL_MANAGER_ROLES } from '@/lib/school-access.server';
import { isEmailConfigured } from '@/lib/email';
import { inviteState, MAX_INVITES_PER_REQUEST, validateInvite, type Invite } from '@/lib/school-invites';
import { appOrigin, createSchoolInvites, InviteLimitError } from '@/lib/school-invites.server';

/** Invites sent by the caller's school, newest first. Owners and school admins only. */
export async function GET() {
  try {
    const guard = await requireSchoolRole(SCHOOL_MANAGER_ROLES);
    if (!guard.ok) return guard.response;
    const { supabase, membership } = guard.context;

    const { data, error } = await supabase
      .from('organization_invitations')
      .select('id, email, name, role, grade_level, expires_at, accepted_at, revoked_at, last_sent_at, send_count, created_at')
      .eq('organization_id', membership.school.id)
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw error;

    const now = new Date();
    return NextResponse.json({
      emailConfigured: isEmailConfigured(),
      grades: membership.school.grade_levels ?? [],
      invites: (data ?? []).map((invite) => ({
        id: invite.id,
        email: invite.email,
        name: invite.name,
        role: invite.role,
        gradeLevel: invite.grade_level,
        state: inviteState(invite, now),
        expiresAt: invite.expires_at,
        acceptedAt: invite.accepted_at,
        lastSentAt: invite.last_sent_at,
        sendCount: invite.send_count,
        createdAt: invite.created_at,
      })),
    });
  } catch (error) {
    console.error('Error in GET /api/schools/current/invites:', error);
    return NextResponse.json({ error: 'Failed to load invites' }, { status: 500 });
  }
}

/**
 * Invite people to the caller's school: { invites: [{ email, name?, role, gradeLevel? }] }.
 * Each row gets its own outcome; rows that fail checks are reported, not sent.
 */
export async function POST(request: NextRequest) {
  try {
    const guard = await requireSchoolRole(SCHOOL_MANAGER_ROLES);
    if (!guard.ok) return guard.response;
    const { supabase, membership, userId, userName } = guard.context;

    const body = await request.json().catch(() => null);
    const list: unknown[] = Array.isArray(body?.invites) ? body.invites : [];
    if (list.length === 0) {
      return NextResponse.json({ error: 'Add at least one person to invite' }, { status: 400 });
    }
    if (list.length > MAX_INVITES_PER_REQUEST) {
      return NextResponse.json({ error: `Send at most ${MAX_INVITES_PER_REQUEST} invites at a time` }, { status: 400 });
    }

    const grades = membership.school.grade_levels ?? [];
    const valid: Invite[] = [];
    const rejected: { email: string; outcome: 'failed'; emailed: false; message: string }[] = [];
    const seen = new Set<string>();
    for (const raw of list) {
      const checked = validateInvite((raw ?? {}) as Record<string, unknown>, grades);
      const email = typeof (raw as any)?.email === 'string' ? String((raw as any).email).trim().toLowerCase() : '';
      if (!checked.ok) {
        rejected.push({ email, outcome: 'failed', emailed: false, message: checked.error });
      } else if (seen.has(checked.value.email)) {
        rejected.push({ email, outcome: 'failed', emailed: false, message: 'This email is listed twice' });
      } else {
        seen.add(checked.value.email);
        valid.push(checked.value);
      }
    }
    const results = valid.length
      ? await createSchoolInvites(
          { supabase, school: membership.school, inviter: { id: userId, name: userName }, origin: appOrigin(request) },
          valid,
        )
      : [];

    return NextResponse.json({ emailConfigured: isEmailConfigured(), results: [...results, ...rejected] });
  } catch (error) {
    if (error instanceof InviteLimitError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error('Error in POST /api/schools/current/invites:', error);
    return NextResponse.json({ error: 'Failed to send invites' }, { status: 500 });
  }
}
