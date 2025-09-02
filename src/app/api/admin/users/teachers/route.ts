import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import bcrypt from "bcryptjs";

export async function GET() {
    try {
        const session = await getServerSession();
        if (!session || session.user?.role !== 'admin') {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const { data, error } = await supabase
            .from('teachers_view')
            .select('*')
            .order('createdAt', { ascending: false });
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

        const body = await request.json();
        const { email, password, name, subjects, grades, qualifications, specializations } = body as any;

        const { data: existing, error: checkErr } = await supabase
            .from('users')
            .select('id')
            .eq('email', email)
            .maybeSingle();
        if (checkErr) throw checkErr;
        if (existing) return NextResponse.json({ error: 'Email already exists' }, { status: 400 });

        const hashedPassword = await bcrypt.hash(password, 10);

        const { data: userRow, error: userErr } = await supabase
            .from('users')
            .insert({ email, password: hashedPassword, name, role: 'teacher' })
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