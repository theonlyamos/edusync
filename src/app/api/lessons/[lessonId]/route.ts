import { NextResponse, NextRequest } from "next/server";
import { z } from 'zod';
import { getServerSession } from "@/lib/auth";
import { createSSRUserSupabase } from "@/lib/supabase.server";
import { mapLessonRecord } from '@/lib/lesson-record';

const updateLessonSchema = z.object({
    title: z.string().trim().min(1).max(160),
    subject: z.string().trim().min(1).max(120),
    gradeLevel: z.string().trim().min(1).max(80),
    objectives: z.array(z.string().trim().min(1).max(500)).min(1).max(20),
    content: z.string().max(100_000).nullable().default(null),
    organizationId: z.string().uuid().nullable().optional(),
});

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ lessonId: string }> }
) {
    try {
        const session = await getServerSession();
        if (!session) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const supabase = await createSSRUserSupabase();
        const { lessonId } = await params;
        const { data: lesson, error } = await supabase
            .from('lessons')
            .select('*, teacher:teachers!inner(user:users(name))')
            .eq('id', lessonId)
            .maybeSingle();
        if (error) throw error;

        if (!lesson) {
            return NextResponse.json(
                { error: "Lesson not found" },
                { status: 404 }
            );
        }

        return NextResponse.json(mapLessonRecord(lesson));
    } catch (error) {
        console.error("Error fetching lesson:", error);
        return NextResponse.json(
            { error: "Failed to fetch lesson" },
            { status: 500 }
        );
    }
}

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ lessonId: string }> }
) {
    try {
        const session = await getServerSession();
        if (!session || !session.user.role || !['admin', 'teacher'].includes(session.user.role)) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const supabase = await createSSRUserSupabase();
        const { lessonId } = await params;
        const { data: existing, error: findErr } = await supabase
            .from('lessons')
            .select('id, teacher_id')
            .eq('id', lessonId)
            .maybeSingle();
        if (findErr) throw findErr;

        if (!existing) {
            return NextResponse.json(
                { error: "Lesson not found" },
                { status: 404 }
            );
        }

        if (session.user.role === 'teacher') {
            const { data: teacher, error: teacherError } = await supabase
                .from('teachers')
                .select('user_id')
                .eq('id', existing.teacher_id)
                .maybeSingle();
            if (teacherError) throw teacherError;
            if (teacher?.user_id !== session.user.id) {
                return NextResponse.json(
                    { error: "Not authorized to update this lesson" },
                    { status: 403 }
                );
            }
        }

        const body = updateLessonSchema.parse(await request.json());
        const updateData = {
            title: body.title,
            subject: body.subject,
            gradelevel: body.gradeLevel,
            objectives: body.objectives,
            content: body.content,
            organization_id: body.organizationId ?? null,
            updated_at: new Date().toISOString(),
        };
        const { data: updatedLesson, error } = await supabase
            .from('lessons')
            .update(updateData)
            .eq('id', lessonId)
            .select('*')
            .maybeSingle();
        if (error) throw error;

        return NextResponse.json(mapLessonRecord(updatedLesson));
    } catch (error) {
        console.error("Error updating lesson:", error);
        return NextResponse.json(
            { error: "Failed to update lesson" },
            { status: 500 }
        );
    }
}

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ lessonId: string }> }
) {
    try {
        const session = await getServerSession();
        if (!session || !session.user.role || !['admin', 'teacher'].includes(session.user.role)) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const supabase = await createSSRUserSupabase();
        const { lessonId } = await params;
        const { data: lesson, error: findErr } = await supabase
            .from('lessons')
            .select('id, teacher_id')
            .eq('id', lessonId)
            .maybeSingle();
        if (findErr) throw findErr;

        if (!lesson) {
            return NextResponse.json(
                { error: "Lesson not found" },
                { status: 404 }
            );
        }

        if (session.user.role === 'teacher') {
            const { data: teacher, error: teacherError } = await supabase
                .from('teachers')
                .select('user_id')
                .eq('id', lesson.teacher_id)
                .maybeSingle();
            if (teacherError) throw teacherError;
            if (teacher?.user_id !== session.user.id) {
                return NextResponse.json(
                    { error: "Not authorized to delete this lesson" },
                    { status: 403 }
                );
            }
        }

        const { error } = await supabase
            .from('lessons')
            .delete()
            .eq('id', lessonId);
        if (error) throw error;

        return NextResponse.json({ message: "Lesson deleted successfully" });
    } catch (error) {
        console.error("Error deleting lesson:", error);
        return NextResponse.json(
            { error: "Failed to delete lesson" },
            { status: 500 }
        );
    }
}
