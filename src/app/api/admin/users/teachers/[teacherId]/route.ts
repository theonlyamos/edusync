import { NextResponse, NextRequest } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase.server';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ teacherId: string }> }
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

        const { teacherId } = await params;
        const { data: userRow } = await supabase
            .from('users')
            .select('id, email, name, role, isActive, createdAt, updatedAt')
            .eq('id', teacherId)
            .eq('role', 'teacher')
            .maybeSingle();
        if (!userRow) {
            return NextResponse.json(
                { error: "Teacher not found" },
                { status: 404 }
            );
        }

        const { data: teacherRow } = await supabase
            .from('teachers')
            .select('*')
            .eq('user_id', teacherId)
            .maybeSingle();
        if (!teacherRow) {
            return NextResponse.json(
                { error: "Teacher details not found" },
                { status: 404 }
            );
        }

        return NextResponse.json({
            _id: userRow.id,
            email: userRow.email,
            name: userRow.name,
            role: userRow.role,
            status: userRow.isActive ? 'active' : 'inactive',
            createdAt: userRow.createdAt,
            updatedAt: userRow.updatedAt,
            userId: teacherRow.user_id,
            subjects: teacherRow.subjects || [],
            grades: teacherRow.grades || [],
            qualifications: teacherRow.qualifications || [],
            specializations: teacherRow.specializations || [],
            joinDate: teacherRow.joinDate || userRow.createdAt
        });
    } catch (error) {
        console.error('Error fetching teacher:', error);
        return NextResponse.json(
            { error: "Failed to fetch teacher" },
            { status: 500 }
        );
    }
}

export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ teacherId: string }> }
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

        const body = await req.json();

        // Update user basic info
        const { name, email, subjects, grades, qualifications, specializations, status } = body;

        const { teacherId } = await params;
        const { error: userErr } = await supabase
            .from('users')
            .update({ name, email, isactive: status === 'active', updated_at: new Date().toISOString() })
            .eq('id', teacherId)
            .eq('role', 'teacher');
        if (userErr) throw userErr;
        const { data: userRow } = await supabase.from('users').select('*').eq('id', teacherId).maybeSingle();
        if (!userRow) {
            return NextResponse.json(
                { error: "Teacher not found" },
                { status: 404 }
            );
        }

        const { data: teacherRow, error: teacherErr } = await supabase
            .from('teachers')
            .update({ subjects, grades, qualifications, specializations })
            .eq('user_id', teacherId)
            .select('*')
            .maybeSingle();
        if (teacherErr) throw teacherErr;
        if (!teacherRow) {
            return NextResponse.json(
                { error: "Teacher details not found" },
                { status: 404 }
            );
        }
        return NextResponse.json({
            _id: userRow.id,
            email: userRow.email,
            name: userRow.name,
            role: userRow.role,
            status: userRow.isactive ? 'active' : 'inactive',
            createdAt: userRow.created_at,
            updatedAt: userRow.updated_at,
            userId: teacherRow.user_id,
            subjects: teacherRow.subjects || [],
            grades: teacherRow.grades || [],
            qualifications: teacherRow.qualifications || [],
            specializations: teacherRow.specializations || [],
            joinDate: teacherRow.joinDate || userRow.createdAt
        });
    } catch (error) {
        console.error('Error updating teacher:', error);
        return NextResponse.json(
            { error: "Failed to update teacher" },
            { status: 500 }
        );
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ teacherId: string }> }
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

        const { teacherId } = await params;
        // Delete from Auth users first (requires service role, which createServerSupabase provides)
        const { error: authError } = await supabase.auth.admin.deleteUser(teacherId);

        if (authError) {
            console.error('Error deleting auth user:', authError);
            // If user not found in auth (already deleted?), proceed to check public.users
            const { error: publicError } = await supabase
                .from('users')
                .delete()
                .eq('id', teacherId)
                .eq('role', 'teacher');

            if (publicError) throw publicError;

            return NextResponse.json(null, { status: 200 });
        }

        // Delete from users table (should cascade to teachers)
        const { error } = await supabase
            .from('users')
            .delete()
            .eq('id', teacherId)
            .eq('role', 'teacher');

        if (error) throw error;

        return NextResponse.json({ message: "Teacher deactivated successfully", id: teacherId });
    } catch (error) {
        console.error('Error deactivating teacher:', error);
        return NextResponse.json(
            { error: "Failed to deactivate teacher" },
            { status: 500 }
        );
    }
} 