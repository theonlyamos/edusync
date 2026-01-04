import { NextResponse, NextRequest } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase.server';

export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession();
        if (!session || session.user?.role !== 'admin') {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const supabase = createServerSupabase();

        const { data, error } = await supabase
            .from('lessons')
            .select(`
                *,
                teacher_info:teachers!teacher_id(
                    user_id,
                    users!inner(name, email)
                )
            `)
            .order('created_at', { ascending: false });

        if (error) {
            // If table doesn't exist yet, return empty list
            if (error?.code === 'PGRST205') {
                return NextResponse.json([]);
            }
            throw error;
        }

        // Transform data to flatten teacher info
        const lessons = (data ?? []).map(lesson => ({
            ...lesson,
            teacherName: lesson.teacher_info?.users?.name || null,
            teacherEmail: lesson.teacher_info?.users?.email || null,
        }));

        return NextResponse.json(lessons);
    } catch (error) {
        console.error('Error fetching lessons:', error);
        return NextResponse.json(
            { error: "Failed to fetch lessons" },
            { status: 500 }
        );
    }
}

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession();
        if (!session || session.user?.role !== 'admin') {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const supabase = createServerSupabase();
        const body = await req.json();

        const payload = {
            title: body.title,
            subject: body.subject,
            gradelevel: body.gradeLevel || body.gradelevel,
            objectives: body.objectives || [],
            content: body.content || '',
            teacher_id: body.teacherId || body.teacher_id || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };

        const { data, error } = await supabase
            .from('lessons')
            .insert(payload)
            .select('*')
            .single();

        if (error) throw error;

        return NextResponse.json(data, { status: 201 });
    } catch (error) {
        console.error('Error creating lesson:', error);
        return NextResponse.json(
            { error: "Failed to create lesson" },
            { status: 500 }
        );
    }
}
