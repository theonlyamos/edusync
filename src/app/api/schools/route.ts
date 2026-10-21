import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { createSSRUserSupabase } from '@/lib/supabase.server';
import { parseSchoolDetails, registerSchoolErrorStatus } from '@/lib/school-registration';

/** Register a new school owned by the signed-in person. */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const parsed = parseSchoolDetails(body ?? {});
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    // register_school() runs as the caller, so its checks use their own account.
    const supabase = await createSSRUserSupabase();
    const { data: schoolId, error } = await supabase.rpc('register_school', {
      p_name: parsed.value.name,
      p_country: parsed.value.country ?? null,
      p_timezone: parsed.value.timezone ?? null,
      p_grade_levels: parsed.value.gradeLevels ?? [],
    });

    if (error) {
      const status = registerSchoolErrorStatus(error.code);
      if (status) {
        const message = error.code === '23505' ? 'You already belong to a school' : error.message;
        return NextResponse.json({ error: message }, { status });
      }
      console.error('Error registering school:', error);
      return NextResponse.json({ error: 'Failed to register school' }, { status: 500 });
    }

    return NextResponse.json({ school: { id: schoolId } }, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/schools:', error);
    return NextResponse.json({ error: 'Failed to register school' }, { status: 500 });
  }
}
