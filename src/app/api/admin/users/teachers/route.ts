import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { createServerSupabase } from '@/lib/supabase.server'

export async function GET() {
    try {
        const session = await getServerSession();
        if (!session || session.user?.role !== 'admin') {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }
        const supabase = createServerSupabase()

        const { data, error } = await supabase
            .from('teachers_view')
            .select('*')
            .order('createdat', { ascending: false });
        if (error) throw error;
        return NextResponse.json(data ?? []);
    } catch (error) {
        console.error("Error fetching teachers:", error);
        return NextResponse.json(
            { error: "Failed to fetch teachers" },
            { status: 500 }
        );
    }
}

export async function POST(request: Request) {
    try {
        const session = await getServerSession();
        if (!session || session.user?.role !== 'admin') {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const supabase = createServerSupabase()

        const body = await request.json();
        const { email, password, name, subjects, grades, qualifications, specializations } = body as any;

        const { data: authUser, error } = await supabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: {
                name: name,
                role: 'teacher' // Default role
            }
        });

        const { data: existing, error: checkErr } = await supabase
            .from('users')
            .select('id')
            .eq('email', email)
            .maybeSingle();
        if (checkErr) throw checkErr;
        if (existing) return NextResponse.json({ error: 'Email already exists' }, { status: 400 });

        const { data: userRow, error: userErr } = await supabase
            .from('users')
            .insert({ id: authUser.user?.id, email, name, role: 'teacher' })
            .select('*')
            .single();
        if (userErr) throw userErr;

        const { data: teacherRow, error: teacherErr } = await supabase
            .from('teachers')
            .insert({
                user_id: userRow.id,
                subjects,
                grades,
                qualifications,
                specializations
            })
            .select('*')
            .single();
        if (teacherErr) throw teacherErr;

        const { password: _pw, ...userWithoutPassword } = userRow as any;
        return NextResponse.json({ ...userWithoutPassword, ...teacherRow });
    } catch (error) {
        console.error("Error creating teacher:", error);
        return NextResponse.json(
            { error: "Failed to create teacher" },
            { status: 500 }
        );
    }

}

export async function PUT(request: Request) {
    try {
        const session = await getServerSession();
        if (!session || session.user?.role !== 'admin') {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        if (!id) return NextResponse.json({ error: "Teacher ID required" }, { status: 400 });

        const supabase = createServerSupabase();
        const body = await request.json();
        const { email, name, subjects, grades, qualifications, specializations } = body;

        // Update user details
        const { error: userErr } = await supabase
            .from('users')
            .update({ email, name })
            .eq('id', id);
        if (userErr) throw userErr;

        // Update teacher details
        const { error: teacherErr } = await supabase
            .from('teachers')
            .update({
                subjects,
                grades,
                qualifications,
                specializations
            })
            .eq('user_id', id);
        if (teacherErr) throw teacherErr;

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error updating teacher:", error);
        return NextResponse.json(
            { error: "Failed to update teacher" },
            { status: 500 }
        );
    }
}

export async function DELETE(request: Request) {
    try {
        const session = await getServerSession();
        if (!session || session.user?.role !== 'admin') {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const supabase = createServerSupabase();

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        if (!id) return NextResponse.json({ error: "Teacher ID required" }, { status: 400 });

        // Delete from Auth users first (requires service role, which createServerSupabase provides)
        const { error: authError } = await supabase.auth.admin.deleteUser(id);

        if (authError) {
            console.error('Error deleting auth user:', authError);
            // If user not found in auth (already deleted?), proceed to check public.users
            const { error: publicError } = await supabase
                .from('users')
                .delete()
                .eq('id', id)
                .eq('role', 'teacher');

            if (publicError) throw publicError;

            return NextResponse.json(null, { status: 200 });
        }

        // Delete from users table (should cascade to teachers)
        const { error } = await supabase
            .from('users')
            .delete()
            .eq('id', id);

        if (error) throw error;

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error deleting teacher:", error);
        return NextResponse.json(
            { error: "Failed to delete teacher" },
            { status: 500 }
        );
    }
}
