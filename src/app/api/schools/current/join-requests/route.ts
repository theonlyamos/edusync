import { NextResponse } from 'next/server';
import { requireSchoolRole, SCHOOL_MANAGER_ROLES } from '@/lib/school-access.server';

/** Students waiting for approval after using a class code. Owners and school admins only. */
export async function GET() {
  try {
    const guard = await requireSchoolRole(SCHOOL_MANAGER_ROLES);
    if (!guard.ok) return guard.response;
    const { supabase, membership } = guard.context;

    const { data, error } = await supabase
      .from('school_join_requests')
      .select('id, grade_level, created_at, users:user_id(name, email), school_join_codes:join_code_id(code)')
      .eq('organization_id', membership.school.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(500);
    if (error) throw error;

    const first = <T,>(value: T | T[] | null | undefined) => (Array.isArray(value) ? value[0] : value) ?? null;
    return NextResponse.json({
      requests: (data ?? []).map((row: any) => ({
        id: row.id,
        gradeLevel: row.grade_level,
        createdAt: row.created_at,
        name: first(row.users)?.name ?? null,
        email: first(row.users)?.email ?? null,
        code: first(row.school_join_codes)?.code ?? null,
      })),
    });
  } catch (error) {
    console.error('Error in GET /api/schools/current/join-requests:', error);
    return NextResponse.json({ error: 'Failed to load join requests' }, { status: 500 });
  }
}
