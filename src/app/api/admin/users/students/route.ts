import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import bcrypt from "bcryptjs";

export async function GET() {
    try {
        const { data, error } = await supabase
            .from('students_view')
            .select('*')
            .order('createdAt', { ascending: false });

        if (error) throw error;
        return NextResponse.json(data ?? []);
    } catch (error) {
        console.error("Error fetching students with user data:", error);
        return NextResponse.json({ error: "Failed to fetch students" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { email, password, name, level: grade } = body as { email: string; password: string; name: string; level: string };

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
            .insert({ email, password: hashedPassword, name, role: 'student' })
            .select('*')
            .single();
        if (userErr) throw userErr;

        const { error: studentErr } = await supabase
            .from('students')
            .insert({ user_id: userRow.id, grade, enrollment_date: new Date().toISOString() });
        if (studentErr) throw studentErr;

        const { password: _pw, ...userWithoutPassword } = userRow as any;
        return NextResponse.json(userWithoutPassword);
    } catch (error) {
        console.error("Error creating student:", error);
        return NextResponse.json({ error: "Failed to create student" }, { status: 500 });
    }
}