import { NextResponse, NextRequest } from "next/server";
import { ZodError } from 'zod';
import { getServerSession } from "@/lib/auth";
import { createSSRUserSupabase, createServerSupabase } from "@/lib/supabase.server";
import { mapLessonRecord } from '@/lib/lesson-record';
import {
    hasRequiredOrganizationAdminMemberships,
    isLessonOrganizationGuardError,
    mapLessonUpdate,
    requiredOrganizationAdminIds,
    updateLessonSchema,
} from '@/lib/lesson-update';

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

        const userSupabase = await createSSRUserSupabase();
        const { lessonId } = await params;
        const { data: existing, error: findErr } = await userSupabase
            .from('lessons')
            .select('id, teacher_id, organization_id')
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
            const { data: teacher, error: teacherError } = await userSupabase
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

        let body;
        try {
            body = updateLessonSchema.parse(await request.json());
        } catch (error) {
            if (error instanceof ZodError) {
                return NextResponse.json(
                    { error: 'Invalid lesson update' },
                    { status: 400 },
                );
            }
            throw error;
        }

        const requiredOrganizationIds = requiredOrganizationAdminIds({
            actorRole: session.user.role,
            currentOrganizationId: existing.organization_id,
            update: body,
        });
        if (requiredOrganizationIds.length > 0) {
            const trustedSupabase = createServerSupabase();
            const { data: memberships, error: membershipError } = await trustedSupabase
                .from('organization_members')
                .select('organization_id, role, is_active')
                .eq('user_id', session.user.id)
                .in('organization_id', requiredOrganizationIds);
            if (membershipError) throw membershipError;

            if (!hasRequiredOrganizationAdminMemberships(requiredOrganizationIds, memberships ?? [])) {
                return NextResponse.json(
                    { error: 'Not authorized to reassign this lesson organization' },
                    { status: 403 },
                );
            }
        }

        const organizationChangeRequested = Object.hasOwn(body, 'organizationId')
            && body.organizationId !== existing.organization_id;
        const { data: updatedLesson, error } = await userSupabase
            .from('lessons')
            .update(mapLessonUpdate(body, new Date().toISOString()))
            .eq('id', lessonId)
            .select('*')
            .maybeSingle();
        if (error) {
            if (isLessonOrganizationGuardError(error, organizationChangeRequested)) {
                return NextResponse.json(
                    { error: 'Not authorized to reassign this lesson organization' },
                    { status: 403 },
                );
            }
            throw error;
        }

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
