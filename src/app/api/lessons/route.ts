import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase.server";

export async function GET(request: Request) {
    try {
        const session = await getServerSession();
        if (!session) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const supabase = createServerSupabase();

        const { searchParams } = new URL(request.url);
        const grade = searchParams.get('grade');
        const subject = searchParams.get('subject');

        let query = supabase.from('lessons').select(`
            *,
            teacher_info:teachers!teacher_id(
                user_id,
                users!inner(name, email)
            )
        `);

        if (grade) query = query.eq('gradelevel', grade);
        if (subject) query = query.eq('subject', subject);

        // For teachers, filter by their teacher record
        if (session.user.role === 'teacher') {
            // Use server supabase to bypass RLS for teacher lookup

            const { data: teacherData } = await supabase
                .from('teachers')
                .select('id')
                .eq('user_id', session.user.id)
                .maybeSingle();

            if (teacherData?.id) {
                query = query.eq('teacher_id', teacherData.id);
            } else {
                // Teacher record not found, return empty
                return NextResponse.json([]);
            }
        }

        const { data, error } = await query.order('created_at', { ascending: false });
        if (error) throw error;

        // Transform to include teacher name/email at top level
        const lessons = (data ?? []).map((lesson: any) => ({
            ...lesson,
            _id: lesson.id,
            teacherName: lesson.teacher_info?.users?.name || null,
            gradeLevel: lesson.gradelevel,
        }));

        return NextResponse.json(lessons);
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

        const supabase = createServerSupabase();

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