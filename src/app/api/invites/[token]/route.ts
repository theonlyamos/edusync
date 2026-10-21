import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase.server';
import { rateLimit } from '@/lib/rate-limiter';
import { findInviteByToken } from '@/lib/school-invite-lookup.server';

type Params = { params: Promise<{ token: string }> };

/**
 * What an invite link is for, so the join page can show it. Anyone holding the
 * link may see this; the link itself was sent to the invited address.
 */
export async function GET(request: NextRequest, { params }: Params) {
  const limited = await rateLimit(request, 'api');
  if (limited) return limited;
  try {
    const { token } = await params;
    const supabase = createServerSupabase();
    const invite = await findInviteByToken(supabase, token);
    if (!invite) {
      return NextResponse.json({ state: 'invalid' }, { status: 404 });
    }

    let accountExists = false;
    if (invite.state === 'pending') {
      const { data, error } = await supabase.from('users').select('id').eq('email', invite.email).maybeSingle();
      if (error) throw error;
      accountExists = Boolean(data);
    }

    return NextResponse.json({
      state: invite.state,
      email: invite.email,
      name: invite.name,
      role: invite.role,
      gradeLevel: invite.gradeLevel,
      school: { name: invite.schoolName },
      accountExists,
      linkEmailed: invite.linkEmailed,
    });
  } catch (error) {
    console.error('Error in GET /api/invites/[token]:', error);
    return NextResponse.json({ error: 'Failed to load invite' }, { status: 500 });
  }
}
