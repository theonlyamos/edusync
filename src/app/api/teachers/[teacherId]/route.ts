import { NextResponse, NextRequest } from 'next/server';
import { createSSRUserSupabase } from '@/lib/supabase.server';

// Get teacher details by ID
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ teacherId: string }> }
) {
    try {
        const supabase = await createSSRUserSupabase();
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const { teacherId } = await params;

        // Fetch teacher data with user info
        const { data: teacher, error } = await supabase
            .from('teachers')
            .select(`
                *,
                user:users!inner(id, name, email, isactive, created_at)
            `)
            .eq('id', teacherId)
            .maybeSingle();

        if (error) throw error;

        if (!teacher) {
            return NextResponse.json(
                { error: "Teacher not found" },
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
        console.error("Error fetching teacher:", error);
        return NextResponse.json(
            { error: "Failed to fetch teacher" },
            { status: 500 }
        );
    }
}

// Update teacher by ID
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ teacherId: string }> }
) {
    try {
        const supabase = await createSSRUserSupabase();
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const { teacherId } = await params;
        const body = await request.json();

        // Update teacher record
        const teacherUpdate: Record<string, any> = {
            updated_at: new Date().toISOString(),
        };

        if (body.subjects !== undefined) teacherUpdate.subjects = body.subjects;
        if (body.grades !== undefined) teacherUpdate.grades = body.grades;
        if (body.qualifications !== undefined) teacherUpdate.qualifications = body.qualifications;
        if (body.specializations !== undefined) teacherUpdate.specializations = body.specializations;

        const { data: teacher, error } = await supabase
            .from('teachers')
            .update(teacherUpdate)
            .eq('id', teacherId)
            .select('user_id')
            .maybeSingle();

        if (error) throw error;

        if (!teacher) {
            return NextResponse.json(
                { error: "Teacher not found" },
                { status: 404 }
            );
        }

        // Update user record if name or status provided
        if (body.name !== undefined || body.isActive !== undefined) {
            const userUpdate: Record<string, any> = {};
            if (body.name !== undefined) userUpdate.name = body.name;
            if (body.isActive !== undefined) userUpdate.isactive = body.isActive;

            const { error: userError } = await supabase
                .from('users')
                .update(userUpdate)
                .eq('id', teacher.user_id);

            if (userError) throw userError;
        }

        return NextResponse.json({ message: "Teacher updated successfully" });
    } catch (error) {
        console.error("Error updating teacher:", error);
        return NextResponse.json(
            { error: "Failed to update teacher" },
            { status: 500 }
        );
    }
}

// Delete teacher by ID
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ teacherId: string }> }
) {
    try {
        const supabase = await createSSRUserSupabase();
        const { data: { user } } = await supabase.auth.getUser();
        
        // Check if user is authenticated and get their role from the database
        if (!user) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        // Verify user is an admin
        const { data: userData } = await supabase
            .from('users')
            .select('role')
            .eq('id', user.id)
            .maybeSingle();

        if (!userData || userData.role !== 'admin') {
            return NextResponse.json(
                { error: "Unauthorized - Admin access required" },
                { status: 403 }
            );
        }

        const { teacherId } = await params;

        // Get the user_id first
        const { data: teacher, error: fetchError } = await supabase
            .from('teachers')
            .select('user_id')
            .eq('id', teacherId)
            .maybeSingle();

        if (fetchError) throw fetchError;

        if (!teacher) {
            return NextResponse.json(
                { error: "Teacher not found" },
                { status: 404 }
            );
        }

        // Delete the teacher record
        const { error: deleteError } = await supabase
            .from('teachers')
            .delete()
            .eq('id', teacherId);

        if (deleteError) throw deleteError;

        // Optionally delete or update the user record
        // For now, just set user to inactive
        const { error: userError } = await supabase
            .from('users')
            .update({ isactive: false })
            .eq('id', teacher.user_id);

        if (userError) throw userError;

        return NextResponse.json({ message: "Teacher deleted successfully" });
    } catch (error) {
        console.error("Error deleting teacher:", error);
        return NextResponse.json(
            { error: "Failed to delete teacher" },
            { status: 500 }
        );
    }
}
