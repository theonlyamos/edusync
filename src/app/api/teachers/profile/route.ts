import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { createSSRUserSupabase } from '@/lib/supabase.server';

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
        const body = await request.json();
        const supabase = await createSSRUserSupabase();

        // Fields that teachers can update
        const updateData: Record<string, any> = {
            updated_at: new Date().toISOString(),
        };

        if (body.qualifications !== undefined) updateData.qualifications = body.qualifications;
        if (body.specializations !== undefined) updateData.specializations = body.specializations;

        const { data: teacher, error } = await supabase
            .from('teachers')
            .update(updateData)
            .eq('user_id', userId)
            .select('*')
            .maybeSingle();

        if (error) throw error;

        if (!teacher) {
            return NextResponse.json(
                { error: "Teacher profile not found" },
                { status: 404 }
            );
        }

        return NextResponse.json(teacher);
    } catch (error) {
        console.error("Error updating teacher profile:", error);
        return NextResponse.json(
            { error: "Failed to update teacher profile" },
            { status: 500 }
        );
    }
}
