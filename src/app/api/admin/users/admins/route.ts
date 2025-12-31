import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase.server'
export async function GET() {
    const supabase = createServerSupabase();
    try {
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

export async function POST(request: Request) {
    const supabase = createServerSupabase();
    try {
        const body = await request.json();
        const { email, password, name } = body;

        const { data: existing, error: checkErr } = await supabase
            .from('users')
            .select('id')
            .eq('email', email)
            .maybeSingle();
        if (checkErr) throw checkErr;
        if (existing) return NextResponse.json({ error: 'Email already exists' }, { status: 400 });

        const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: {
                name: name,
                role: 'admin' // Default role
            }
        });

        const { data, error } = await supabase
            .from('users')
            .insert({ id: authUser.user?.id, email, name, role: 'admin' })
            .select('id, email, name, role, image, isactive, lastlogin, created_at, updated_at')
            .single();
        if (error) throw error;

        const { data: adminRow, error: adminErr } = await supabase
            .from('admins')
            .insert({ user_id: authUser.user?.id, issuperadmin: true, permissions: [] })
            .select('*')
            .maybeSingle();
        if (adminErr) throw adminErr;
        if (!adminRow) {
            return NextResponse.json(
                { error: "Admin details not found" },
                { status: 404 }
            );
        }

        const { password: _pw, ...userWithoutPassword } = data as any;
        return NextResponse.json({ ...userWithoutPassword, ...adminRow });
    } catch (error) {
        console.error('Error creating admin:', error);
        return NextResponse.json(
            { error: 'Failed to create admin' },
            { status: 500 }
        );
    }
} 