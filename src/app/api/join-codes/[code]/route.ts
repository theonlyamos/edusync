import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { createServerSupabase, createSSRUserSupabase } from '@/lib/supabase.server';
import { rateLimit } from '@/lib/rate-limiter';
import { isJoinCodeFormat, normalizeJoinCode, schoolJoinErrorStatus } from '@/lib/school-invites';

type Params = { params: Promise<{ code: string }> };

const NOT_VALID = 'That class code is not valid';

/** The school and grade behind a class code, so the join page can show them. */
export async function GET(request: NextRequest, { params }: Params) {
  const limited = await rateLimit(request, 'api');
  if (limited) return limited;
  try {
    const code = normalizeJoinCode((await params).code);
    if (!isJoinCodeFormat(code)) return NextResponse.json({ error: NOT_VALID }, { status: 404 });

    const supabase = createServerSupabase();
    const { data, error } = await supabase
      .from('school_join_codes')
      .select('grade_level, expires_at, organizations!inner(name, type, is_active)')
      .eq('code', code)
      .is('revoked_at', null)
      .maybeSingle();
    if (error) throw error;
    const school = data && ((Array.isArray(data.organizations) ? data.organizations[0] : data.organizations) as
      | { name: string; type: string; is_active: boolean }
      | undefined);
    const expired = data?.expires_at ? new Date(data.expires_at).getTime() < Date.now() : false;
    if (!data || !school || school.type !== 'school' || !school.is_active || expired) {
      return NextResponse.json({ error: NOT_VALID }, { status: 404 });
    }
    return NextResponse.json({ code, school: { name: school.name }, gradeLevel: data.grade_level });
  } catch (error) {
    console.error('Error in GET /api/join-codes/[code]:', error);
    return NextResponse.json({ error: 'Failed to check class code' }, { status: 500 });
  }
}

/** The signed-in person asks to join the school behind a class code. A school admin approves it. */
export async function POST(request: NextRequest, { params }: Params) {
  const limited = await rateLimit(request, 'api');
  if (limited) return limited;
  try {
    const session = await getServerSession();
    if (!session?.user) return NextResponse.json({ error: 'Sign in to use a class code' }, { status: 401 });

    const code = normalizeJoinCode((await params).code);
    if (!isJoinCodeFormat(code)) return NextResponse.json({ error: NOT_VALID }, { status: 404 });

    // request_school_join() runs as the caller, so its checks use their own account.
    const supabase = await createSSRUserSupabase();
    const { data, error } = await supabase.rpc('request_school_join', { p_code: code });
    if (error) {
      const status = schoolJoinErrorStatus(error.code);
      if (status) return NextResponse.json({ error: error.message }, { status });
      console.error('Error requesting to join school:', error);
      return NextResponse.json({ error: 'Failed to send your request' }, { status: 500 });
    }
    const result = data as { request_id: string; grade_level: string; status: string };
    return NextResponse.json({ request: { id: result.request_id, gradeLevel: result.grade_level, status: result.status } }, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/join-codes/[code]:', error);
    return NextResponse.json({ error: 'Failed to send your request' }, { status: 500 });
  }
}
