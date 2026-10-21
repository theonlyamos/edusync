import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase.server';
import { rateLimit } from '@/lib/rate-limiter';
import { findInviteByToken } from '@/lib/school-invite-lookup.server';

type Params = { params: Promise<{ token: string }> };

const ACCOUNT_EXISTS = 'An account with this email already exists. Log in to accept the invite.';

/**
 * Creates the account for a new person from their invite link. The link was
 * sent to the invited address, so that address counts as confirmed. The
 * person then signs in and accepts the invite as themselves.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const limited = await rateLimit(request, 'api');
  if (limited) return limited;
  try {
    const { token } = await params;
    const body = await request.json().catch(() => null);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    if (name.length < 2 || name.length > 120) {
      return NextResponse.json({ error: 'Enter your name (2 to 120 characters).' }, { status: 400 });
    }
    if (password.length < 8 || password.length > 72) {
      return NextResponse.json({ error: 'Use a password of 8 to 72 characters.' }, { status: 400 });
    }

    const supabase = createServerSupabase();
    const invite = await findInviteByToken(supabase, token);
    if (!invite) return NextResponse.json({ error: 'This invite link is not valid' }, { status: 404 });
    if (invite.state !== 'pending') {
      return NextResponse.json({ error: 'This invite can no longer be used' }, { status: 409 });
    }

    const { data: existing, error: lookupError } = await supabase.from('users').select('id').eq('email', invite.email).maybeSingle();
    if (lookupError) throw lookupError;
    if (existing) return NextResponse.json({ error: ACCOUNT_EXISTS }, { status: 409 });

    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email: invite.email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });
    if (createError || !created?.user) {
      if (createError && /already|exists|registered/i.test(createError.message)) {
        return NextResponse.json({ error: ACCOUNT_EXISTS }, { status: 409 });
      }
      throw createError ?? new Error('No user returned');
    }

    // Invited people start with no personal credits; the school pays.
    const role = invite.role === 'teacher' || invite.role === 'student' ? invite.role : 'learner';
    const { error: profileError } = await supabase
      .from('users')
      .upsert({ id: created.user.id, email: invite.email, name, role, credits: 0 }, { onConflict: 'id', ignoreDuplicates: true });
    if (profileError) throw profileError;

    return NextResponse.json({ email: invite.email }, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/invites/[token]/signup:', error);
    return NextResponse.json({ error: 'Failed to create your account' }, { status: 500 });
  }
}
