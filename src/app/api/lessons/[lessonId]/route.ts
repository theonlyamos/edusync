import { NextResponse, NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ lessonId: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const { lessonId } = await params;
        const { data: lesson, error } = await supabase
            .from('lessons')
            .select('*, teacher:users(name)')
            .eq('id', lessonId)
            .maybeSingle();
        if (error) throw error;

        if (!lesson) {
            return NextResponse.json(
                { error: "Lesson not found" },
                { status: 404 }
            );
        }

        return NextResponse.json(lesson);
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
        const session = await getServerSession(authOptions);
        if (!session || !session.user.role || !['admin', 'teacher'].includes(session.user.role)) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const { lessonId } = await params;
        const { data: existing, error: findErr } = await supabase
            .from('lessons')
            .select('id, teacher')
            .eq('id', lessonId)
            .maybeSingle();
        if (findErr) throw findErr;

        if (!existing) {
            return NextResponse.json(
                { error: "Lesson not found" },
                { status: 404 }
            );
        }

        if (session.user.role === 'teacher' && String(existing.teacher) !== session.user.id) {
            return NextResponse.json(
                { error: "Not authorized to update this lesson" },
                { status: 403 }
            );
        }

        const body = await request.json();
        const { data: updatedLesson, error } = await supabase
            .from('lessons')
            .update(body)
            .eq('id', lessonId)
            .select('*, teacher:users(name)')
            .maybeSingle();
        if (error) throw error;

        return NextResponse.json(updatedLesson);
    } catch (error) {
        console.error("Error updating lesson:", error);
        return NextResponse.json(
            { error: "Failed to update lesson" },
            { status: 500 }
        );
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ lessonId: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user.role || !['admin', 'teacher'].includes(session.user.role)) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const { lessonId } = await params;
        const { data: lesson, error: findErr } = await supabase
            .from('lessons')
            .select('id, teacher')
            .eq('id', lessonId)
            .maybeSingle();
        if (findErr) throw findErr;

        if (!lesson) {
            return NextResponse.json(
                { error: "Lesson not found" },
                { status: 404 }
            );
        }

        if (session.user.role === 'teacher' && String(lesson.teacher) !== session.user.id) {
            return NextResponse.json(
                { error: "Not authorized to delete this lesson" },
                { status: 403 }
            );
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