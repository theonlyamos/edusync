import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { createSSRUserSupabase } from '@/lib/supabase.server';
import { schoolJoinErrorStatus } from '@/lib/school-invites';

type Params = { params: Promise<{ requestId: string }> };

/** Approve or decline a class-code request: { approve: boolean }. */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const session = await getServerSession();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => null);
    if (typeof body?.approve !== 'boolean') {
      return NextResponse.json({ error: 'Say whether to approve the request' }, { status: 400 });
    }
    const { requestId } = await params;

    // decide_school_join_request() checks that the caller runs this school.
    const supabase = await createSSRUserSupabase();
    const { data, error } = await supabase.rpc('decide_school_join_request', {
      p_request_id: requestId,
      p_approve: body.approve,
    });
    if (error) {
      const status = schoolJoinErrorStatus(error.code);
      if (status) return NextResponse.json({ error: error.message }, { status });
      console.error('Error deciding join request:', error);
      return NextResponse.json({ error: 'Failed to update the request' }, { status: 500 });
    }
    return NextResponse.json({ request: data });
  } catch (error) {
    console.error('Error in POST /api/schools/current/join-requests/[requestId]:', error);
    return NextResponse.json({ error: 'Failed to update the request' }, { status: 500 });
  }
}
