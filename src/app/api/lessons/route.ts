import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase.server";
import { mapLessonRecord } from '@/lib/lesson-record';
import { getUserSchoolId } from '@/lib/school';

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
        const role = session.user.role;
        const canManage = role === 'teacher' || role === 'admin';
        // Archived lessons are hidden unless a teacher or admin asks for them.
        query = canManage && searchParams.get('archived') === 'only'
            ? query.not('archived_at', 'is', null)
            : query.is('archived_at', null);
        // Everyone else only sees lessons that have been published to students.
        if (!canManage) query = query.not('current_publication_id', 'is', null);

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
        } else if (session.user.role !== 'admin') {
            // Everyone else only sees lessons from their own school.
            const schoolId = await getUserSchoolId(supabase, session.user.id);
            if (!schoolId) return NextResponse.json([]);
            query = query.eq('organization_id', schoolId);
        }

        // Optional paging: ?limit=24&offset=0. Without it every lesson is returned.
        const limit = Math.min(100, Math.max(0, Number.parseInt(searchParams.get('limit') ?? '', 10) || 0));
        const offset = Math.max(0, Number.parseInt(searchParams.get('offset') ?? '', 10) || 0);
        // Paged requests ask for one extra row to know whether another page exists.
        const { data: rows, error } = limit
            ? await query.order('created_at', { ascending: false }).order('id', { ascending: true }).range(offset, offset + limit)
            : await query.order('created_at', { ascending: false });
        if (error) throw error;
        const hasMore = limit > 0 && (rows?.length ?? 0) > limit;
        const data = hasMore ? rows!.slice(0, limit) : rows;

        // Transform to include teacher name/email at top level
        const lessons = (data ?? []).map((lesson: any) => mapLessonRecord({
            ...lesson,
            teacherName: lesson.teacher_info?.users?.name || null,
        }));

        return NextResponse.json(lessons, limit ? { headers: { 'X-Has-More': hasMore ? '1' : '0' } } : undefined);
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
