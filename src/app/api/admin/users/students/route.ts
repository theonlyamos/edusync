import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { createStudentSchema } from "@/lib/validation/admin";
import { createServerSupabase } from '@/lib/supabase.server'

export async function GET() {
    try {
        const session = await getServerSession();
        if (!session?.user) {
            return NextResponse.json(
                { error: 'Authentication required' },
                { status: 401 }
            );
        }

        if (session.user.role !== 'admin') {
            return NextResponse.json(
                { error: 'Admin access required' },
                { status: 403 }
            );
        }

        const supabase = createServerSupabase();

        const { data, error } = await supabase
            .from('students_view')
            .select('*')
            .order('createdat', { ascending: false });

        if (error) throw error;
        return NextResponse.json(data ?? []);
    } catch (error) {
        console.error("Error fetching students with user data:", error);
        return NextResponse.json({ error: "Failed to fetch students" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const session = await getServerSession();
        if (!session?.user) {
            return NextResponse.json(
                { error: 'Authentication required' },
                { status: 401 }
            );
        }

        // Check if user is admin
        if (session.user.role !== 'admin') {
            return NextResponse.json(
                { error: 'Admin access required' },
                { status: 403 }
            );
        }

        const supabase = createServerSupabase();

        const body = await request.json();

        // Validate input
        const validation = createStudentSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json(
                { error: 'Invalid input', details: validation.error.flatten() },
                { status: 400 }
            );
        }

        const { email, password, name, level: grade, guardianName, guardianContact } = validation.data;

        const { data: authUser, error } = await supabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: {
                name: name,
                role: 'student' // Default role
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
            .insert({ id: authUser.user?.id, email, name, role: 'student' })
            .select('*')
            .single();
        if (userErr) throw userErr;

        const { error: studentErr } = await supabase
            .from('students')
            .insert({
                user_id: userRow.id,
                grade,
                enrollment_date: new Date().toISOString(),
                guardian_name: guardianName || null,
                guardian_contact: guardianContact || null,
            });
        if (studentErr) throw studentErr;

        const { password: _pw, ...userWithoutPassword } = userRow as any;
        return NextResponse.json(userWithoutPassword);
    } catch (error) {
        console.error("Error creating student:", error);
        return NextResponse.json({ error: "Failed to create student" }, { status: 500 });
    }
}