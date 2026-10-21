import { NextRequest, NextResponse } from 'next/server';
import { isSchoolManager, requireSchoolRole } from '@/lib/school-access.server';

type Params = { params: Promise<{ codeId: string }> };

/** Turn off a class code. Teachers can turn off their own codes; owners and admins any. */
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const guard = await requireSchoolRole(['owner', 'admin', 'teacher']);
    if (!guard.ok) return guard.response;
    const { supabase, membership, userId } = guard.context;
    const { codeId } = await params;

    let query = supabase
      .from('school_join_codes')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', codeId)
      .eq('organization_id', membership.school.id)
      .is('revoked_at', null);
    if (!isSchoolManager(membership.role)) query = query.eq('created_by', userId);
    const { data, error } = await query.select('id');
    if (error) throw error;
    if (!data?.length) return NextResponse.json({ error: 'Class code not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error in DELETE /api/schools/current/join-codes/[codeId]:', error);
    return NextResponse.json({ error: 'Failed to turn off class code' }, { status: 500 });
  }
}
