import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getServerSession } from "@/lib/auth";

export async function GET(request: Request) {
    try {
        const session = await getServerSession();
        if (!session) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const { searchParams } = new URL(request.url);
        const grade = searchParams.get('grade');
        const subject = searchParams.get('subject');

        let query = supabase.from('lessons').select('*, teacher:users(name)');
        if (grade) query = query.eq('grade', grade);
        if (subject) query = query.eq('subject', subject);
        if (session.user.role === 'teacher') query = query.eq('teacher', session.user.id);
        const { data, error } = await query.order('createdAt', { ascending: false });
        if (error) throw error;
        return NextResponse.json(data ?? []);
    } catch (error) {
        console.error("Error fetching lessons:", error);
        return NextResponse.json(
            { error: "Failed to fetch lessons" },
            { status: 500 }
        );
    }
}

export async function POST(request: Request) {
    try {
        const session = await getServerSession();
        if (!session || !session.user.role || !['admin', 'teacher'].includes(session.user.role)) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const body = await request.json();
        const insert = { ...body, teacher: session.user.id, status: 'draft' } as any;
        const { data, error } = await supabase
            .from('lessons')
            .insert(insert)
            .select('*, teacher:users(name)')
            .single();
        if (error) throw error;
        return NextResponse.json(data);
    } catch (error) {
        console.error("Error creating lesson:", error);
        return NextResponse.json(
            { error: "Failed to create lesson" },
            { status: 500 }
        );
    }
} 