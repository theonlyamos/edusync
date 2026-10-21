import { NextRequest, NextResponse } from 'next/server';
import { isSchoolManager, requireSchoolRole } from '@/lib/school-access.server';
import { normalizeGradeLevel } from '@/lib/school-invites';
import { generateJoinCode } from '@/lib/school-invites.server';

const CODE_ROLES = ['owner', 'admin', 'teacher'] as const;
const MAX_DAYS = 365;

/** Class join codes: all of the school's for owners and admins, a teacher's own for teachers. */
export async function GET() {
  try {
    const guard = await requireSchoolRole(CODE_ROLES);
    if (!guard.ok) return guard.response;
    const { supabase, membership, userId } = guard.context;

    let query = supabase
      .from('school_join_codes')
      .select('id, code, grade_level, created_by, expires_at, created_at, users:created_by(name)')
      .eq('organization_id', membership.school.id)
      .is('revoked_at', null)
      .order('created_at', { ascending: false })
      .limit(200);
    if (!isSchoolManager(membership.role)) query = query.eq('created_by', userId);
    const { data, error } = await query;
    if (error) throw error;

    const now = Date.now();
    return NextResponse.json({
      grades: membership.school.grade_levels ?? [],
      codes: (data ?? []).map((row: any) => ({
        id: row.id,
        code: row.code,
        gradeLevel: row.grade_level,
        createdBy: (Array.isArray(row.users) ? row.users[0] : row.users)?.name ?? null,
        expiresAt: row.expires_at,
        expired: row.expires_at ? new Date(row.expires_at).getTime() < now : false,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    console.error('Error in GET /api/schools/current/join-codes:', error);
    return NextResponse.json({ error: 'Failed to load class codes' }, { status: 500 });
  }
}

/** Create a class join code for one grade: { gradeLevel, expiresInDays? }. */
export async function POST(request: NextRequest) {
  try {
    const guard = await requireSchoolRole(CODE_ROLES);
    if (!guard.ok) return guard.response;
    const { supabase, membership, userId } = guard.context;

    const body = await request.json().catch(() => null);
    const gradeLevel = normalizeGradeLevel(body?.gradeLevel);
    if (!gradeLevel) return NextResponse.json({ error: 'Pick a grade for this code' }, { status: 400 });
    const grades = membership.school.grade_levels ?? [];
    if (grades.length > 0 && !grades.includes(gradeLevel)) {
      return NextResponse.json({ error: 'That grade is not one of your school’s grades' }, { status: 400 });
    }
    let expiresAt: string | null = null;
    if (body?.expiresInDays !== undefined && body?.expiresInDays !== null) {
      const days = Number(body.expiresInDays);
      if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) {
        return NextResponse.json({ error: `Codes can last 1 to ${MAX_DAYS} days` }, { status: 400 });
      }
      expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    }

    // Codes are random; retry the rare clash with an existing one.
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data, error } = await supabase
        .from('school_join_codes')
        .insert({ organization_id: membership.school.id, code: generateJoinCode(), grade_level: gradeLevel, created_by: userId, expires_at: expiresAt })
        .select('id, code, grade_level, expires_at, created_at')
        .single();
      if (!error) {
        return NextResponse.json({
          code: { id: data.id, code: data.code, gradeLevel: data.grade_level, expiresAt: data.expires_at, createdAt: data.created_at },
        }, { status: 201 });
      }
      if (error.code !== '23505') throw error;
    }
    throw new Error('Could not pick a unique class code');
  } catch (error) {
    console.error('Error in POST /api/schools/current/join-codes:', error);
    return NextResponse.json({ error: 'Failed to create class code' }, { status: 500 });
  }
}
