import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase.server'
import { logAdminAction, requirePlatformAdmin } from '@/lib/platform-admin.server';
import { adminPromotionProblem } from '@/lib/platform-admin';
import { isValidEmail, normalizeEmail } from '@/lib/school-people';
export async function GET() {
    const supabase = createServerSupabase();
    try {
        const session = await getServerSession();
        if (!session || session.user?.role !== 'admin') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { data, error } = await supabase
            .from('users')
            .select('id, email, name, image, isactive, lastlogin, created_at, updated_at')
            .eq('role', 'admin')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return NextResponse.json(data ?? []);
    } catch (error) {
        console.error('Error fetching admins:', error);
        return NextResponse.json(
            { error: 'Failed to fetch admins' },
            { status: 500 }
        );
    }
}

/**
 * Makes an existing account a platform admin. Nobody types a password here:
 * the person signs up (or already has an account) and keeps their own login.
 */
export async function POST(request: Request) {
    const access = await requirePlatformAdmin();
    if (!access.ok) return access.response;
    const { supabase } = access.context;

    const body = await request.json().catch(() => ({}));
    const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : '';
    if (!isValidEmail(email)) {
        return NextResponse.json({ error: 'Enter the email of an existing account.' }, { status: 400 });
    }

    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('id, email, name, role')
            .eq('email', email)
            .maybeSingle();
        if (error) throw error;
        if (!user) {
            return NextResponse.json({ error: 'No account uses that email. Ask them to sign up first.' }, { status: 404 });
        }
        const problem = adminPromotionProblem(user.role);
        if (problem) return NextResponse.json({ error: problem }, { status: 409 });

        const { data: updated, error: updateError } = await supabase
            .from('users')
            .update({ role: 'admin' })
            .eq('id', user.id)
            .select('id, email, name, image, isactive, lastlogin, created_at, updated_at')
            .single();
        if (updateError) throw updateError;

        const { data: adminRow } = await supabase.from('admins').select('id').eq('user_id', user.id).maybeSingle();
        if (!adminRow) {
            const { error: adminError } = await supabase
                .from('admins')
                .insert({ user_id: user.id, issuperadmin: true, permissions: [] });
            if (adminError) console.error('Could not add admin details row:', adminError);
        }

        await logAdminAction(access.context, { action: 'admin.add', targetType: 'user', targetId: user.id, targetLabel: user.email });
        return NextResponse.json(updated);
    } catch (error) {
        console.error('Error adding admin:', error);
        return NextResponse.json({ error: 'Failed to add admin' }, { status: 500 });
    }
}
