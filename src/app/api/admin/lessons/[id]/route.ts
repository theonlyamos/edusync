import { NextResponse, NextRequest } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase.server';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession();
        if (!session || session.user?.role !== 'admin') {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const supabase = createServerSupabase();
        const { id } = await params;

        const { data, error } = await supabase
            .from('lessons')
            .select(`
                *,
                teacher_info:teachers!teacher_id(
                    user_id,
                    users!inner(name, email)
                )
            `)
            .eq('id', id)
            .maybeSingle();

        if (error) throw error;
        if (!data) {
            return NextResponse.json(
                { error: "Lesson not found" },
                { status: 404 }
            );
        }

        return NextResponse.json({
            ...data,
            teacherName: data.teacher_info?.users?.name || null,
            teacherEmail: data.teacher_info?.users?.email || null,
        });
    } catch (error) {
        console.error('Error fetching lesson:', error);
        return NextResponse.json(
            { error: "Failed to fetch lesson" },
            { status: 500 }
        );
    }
}

export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession();
        if (!session || session.user?.role !== 'admin') {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const supabase = createServerSupabase();
        const { id } = await params;
        const body = await req.json();

        const updateData: Record<string, any> = {
            updated_at: new Date().toISOString(),
        };

        if (body.title !== undefined) updateData.title = body.title;
        if (body.subject !== undefined) updateData.subject = body.subject;
        if (body.gradeLevel !== undefined || body.gradelevel !== undefined) {
            updateData.gradelevel = body.gradeLevel || body.gradelevel;
        }
        if (body.objectives !== undefined) updateData.objectives = body.objectives;
        if (body.content !== undefined) updateData.content = body.content;
        if (body.teacherId !== undefined || body.teacher_id !== undefined) {
            updateData.teacher_id = body.teacherId || body.teacher_id;
        }

        const { data, error } = await supabase
            .from('lessons')
            .update(updateData)
            .eq('id', id)
            .select('*')
            .maybeSingle();

        if (error) throw error;
        if (!data) {
            return NextResponse.json(
                { error: "Lesson not found" },
                { status: 404 }
            );
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error('Error updating lesson:', error);
        return NextResponse.json(
            { error: "Failed to update lesson" },
            { status: 500 }
        );
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession();
        if (!session || session.user?.role !== 'admin') {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const supabase = createServerSupabase();
        const { id } = await params;

        const { error } = await supabase
            .from('lessons')
            .delete()
            .eq('id', id);

        if (error) throw error;

        return NextResponse.json({ message: "Lesson deleted successfully" });
    } catch (error) {
        console.error('Error deleting lesson:', error);
        return NextResponse.json(
            { error: "Failed to delete lesson" },
            { status: 500 }
        );
    }
}
