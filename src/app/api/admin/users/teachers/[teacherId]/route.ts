import { NextResponse, NextRequest } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

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

        const body = await req.json();

        // Update user basic info
        const { name, email, subjects, grades, qualifications, specializations, status } = body;

        const { teacherId } = await params;
        const { error: userErr } = await supabase
            .from('users')
            .update({ name, email, isActive: status === 'active', updatedAt: new Date().toISOString() })
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

        const { teacherId } = await params;
        const { data: userRow, error } = await supabase
            .from('users')
            .update({ isActive: false, updatedAt: new Date().toISOString() })
            .eq('id', teacherId)
            .eq('role', 'teacher')
            .select('id')
            .maybeSingle();
        if (error) throw error;
        if (!userRow) {
            return NextResponse.json(
                { error: "Teacher not found" },
                { status: 404 }
            );
        }

        return NextResponse.json({ message: "Teacher deactivated successfully", id: userRow.id });
    } catch (error) {
        console.error('Error deactivating teacher:', error);
        return NextResponse.json(
            { error: "Failed to deactivate teacher" },
            { status: 500 }
        );
    }
} 