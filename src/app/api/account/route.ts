import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase.server';
import { getActiveSchoolMembership } from '@/lib/school-access.server';

/** The signed-in user's own account details, for any role. */
export async function GET() {
  try {
    const session = await getServerSession();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = createServerSupabase();
    const userId = session.user.id;
    const [{ data: user, error }, membership, student] = await Promise.all([
      db.from('users').select('name, email, role, created_at').eq('id', userId).maybeSingle(),
      getActiveSchoolMembership(db, userId),
      session.user.role === 'student'
        ? db.from('students').select('grade').eq('user_id', userId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    if (error) throw error;
    if (!user) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

    return NextResponse.json({
      name: user.name ?? '',
      email: user.email ?? session.user.email,
      role: user.role,
      createdAt: user.created_at ?? null,
      grade: (student.data as { grade?: string | null } | null)?.grade ?? null,
      school: membership ? { name: membership.school.name, role: membership.role } : null,
    });
  } catch (error) {
    console.error('Error in GET /api/account:', error);
    return NextResponse.json({ error: 'Failed to load your account' }, { status: 500 });
  }
}

const updateSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(100),
});

/** Update the signed-in user's own name. */
export async function PATCH(request: Request) {
  try {
    const session = await getServerSession();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const parsed = updateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check your details' }, { status: 400 });
    }

    // Scoped to the caller's own row.
    const { error } = await createServerSupabase()
      .from('users')
      .update({ name: parsed.data.name })
      .eq('id', session.user.id);
    if (error) throw error;
    return NextResponse.json({ ok: true, name: parsed.data.name });
  } catch (error) {
    console.error('Error in PATCH /api/account:', error);
    return NextResponse.json({ error: 'Failed to save your account' }, { status: 500 });
  }
}
