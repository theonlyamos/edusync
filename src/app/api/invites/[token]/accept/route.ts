import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { createSSRUserSupabase } from '@/lib/supabase.server';
import { homeForSchoolRole, schoolJoinErrorStatus } from '@/lib/school-invites';

type Params = { params: Promise<{ token: string }> };

/** The signed-in person accepts an invite sent to their email address. */
export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Sign in to accept this invite' }, { status: 401 });
    }
    const { token } = await params;

    // accept_school_invite() runs as the caller, so it checks their own email.
    const supabase = await createSSRUserSupabase();
    const { data, error } = await supabase.rpc('accept_school_invite', { p_token: token });
    if (error) {
      const status = schoolJoinErrorStatus(error.code);
      if (status) return NextResponse.json({ error: error.message }, { status });
      console.error('Error accepting invite:', error);
      return NextResponse.json({ error: 'Failed to accept invite' }, { status: 500 });
    }

    const result = data as { organization_id: string; role: string };
    return NextResponse.json({
      school: { id: result.organization_id },
      role: result.role,
      redirectTo: homeForSchoolRole(result.role, result.organization_id),
    });
  } catch (error) {
    console.error('Error in POST /api/invites/[token]/accept:', error);
    return NextResponse.json({ error: 'Failed to accept invite' }, { status: 500 });
  }
}
