import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { z } from 'zod';
import { createServerSupabase, createSSRUserSupabase } from '@/lib/supabase.server';
import { GRADE_LEVELS } from '@/lib/constants';

// Get current teacher's profile
export async function GET(request: Request) {
    try {
        const session = await getServerSession();
        if (!session || session.user?.role !== 'teacher') {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const userId = session.user.id;
        const supabase = await createSSRUserSupabase();

        // Fetch teacher data with user info
        const { data: teacher, error } = await supabase
            .from('teachers')
            .select(`
                *,
                user:users!inner(id, name, email, isactive, created_at)
            `)
            .eq('user_id', userId)
            .maybeSingle();

        if (error) throw error;

        if (!teacher) {
            return NextResponse.json(
                { error: "Teacher profile not found" },
                { status: 404 }
            );
        }

        // Transform data
        const response = {
            id: teacher.id,
            userId: teacher.user_id,
            name: teacher.user?.name || '',
            email: teacher.user?.email || '',
            subjects: teacher.subjects || [],
            grades: teacher.grades || [],
            qualifications: teacher.qualifications || [],
            specializations: teacher.specializations || [],
            joinDate: teacher.joindate,
            isActive: teacher.user?.isactive ?? true,
            createdAt: teacher.created_at,
        };

        return NextResponse.json(response);
    } catch (error) {
        console.error("Error fetching teacher profile:", error);
        return NextResponse.json(
            { error: "Failed to fetch teacher profile" },
            { status: 500 }
        );
    }
}

const profileUpdateSchema = z.object({
    name: z.string().trim().min(1, 'Enter your name').max(100).optional(),
    subjects: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
    grades: z.array(z.preprocess((v) => (typeof v === 'string' ? v.trim().toLowerCase() : v), z.enum(GRADE_LEVELS, { message: 'Choose grades from the list' }))).max(GRADE_LEVELS.length).optional(),
    qualifications: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
    specializations: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
});

// Update current teacher's profile
export async function PUT(request: Request) {
    try {
        const session = await getServerSession();
        if (!session || session.user?.role !== 'teacher') {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const userId = session.user.id;
        const parsed = profileUpdateSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check your details' }, { status: 400 });
        }
        const body = parsed.data;
        // Writes are scoped to the signed-in teacher's own rows.
        const db = createServerSupabase();

        const updateData: Record<string, unknown> = {
            updated_at: new Date().toISOString(),
        };
        if (body.subjects !== undefined) updateData.subjects = [...new Set(body.subjects)];
        if (body.grades !== undefined) updateData.grades = [...new Set(body.grades)];
        if (body.qualifications !== undefined) updateData.qualifications = body.qualifications;
        if (body.specializations !== undefined) updateData.specializations = body.specializations;

        const { data: teacher, error } = await db
            .from('teachers')
            .update(updateData)
            .eq('user_id', userId)
            .select('id')
            .maybeSingle();
        if (error) throw error;
        if (!teacher) {
            return NextResponse.json(
                { error: "Teacher profile not found" },
                { status: 404 }
            );
        }

        if (body.name !== undefined) {
            const { error: nameError } = await db.from('users').update({ name: body.name }).eq('id', userId);
            if (nameError) throw nameError;
        }

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error("Error updating teacher profile:", error);
        return NextResponse.json(
            { error: "Failed to update teacher profile" },
            { status: 500 }
        );
    }
}
