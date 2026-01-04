import { NextResponse, NextRequest } from "next/server";
import { getServerSession } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase.server';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ level: string }> }
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
        const { level } = await params;
        const decodedLevel = decodeURIComponent(level);

        // Fetch students with this grade level
        const { data: studentsData, error: studentsError } = await supabase
            .from('students')
            .select(`
                id,
                grade,
                user:users!inner(id, name, email, isactive, created_at)
            `)
            .eq('grade', decodedLevel);

        if (studentsError) throw studentsError;

        // Fetch teachers who teach this grade level
        const { data: teachersData, error: teachersError } = await supabase
            .from('teachers')
            .select(`
                id,
                grades,
                user:users!inner(id, name, email, isactive, created_at)
            `)
            .contains('grades', [decodedLevel]);

        if (teachersError) throw teachersError;

        // Fetch lessons for this grade level
        const { data: lessonsData, error: lessonsError } = await supabase
            .from('lessons')
            .select(`
                id,
                title,
                subject,
                gradelevel,
                created_at
            `)
            .eq('gradelevel', decodedLevel);

        if (lessonsError) throw lessonsError;

        // Transform data for frontend compatibility
        const students = (studentsData ?? []).map((s: any) => ({
            _id: s.user?.id || s.id,
            name: s.user?.name || '',
            email: s.user?.email || '',
            status: s.user?.isactive ? 'active' : 'inactive',
            createdAt: s.user?.created_at || ''
        }));

        const teachers = (teachersData ?? []).map((t: any) => ({
            _id: t.user?.id || t.id,
            name: t.user?.name || '',
            email: t.user?.email || '',
            status: t.user?.isactive ? 'active' : 'inactive',
            createdAt: t.user?.created_at || ''
        }));

        const lessons = (lessonsData ?? []).map(l => ({
            _id: l.id,
            title: l.title,
            subject: l.subject,
            teacherName: '', // Would need additional join to get teacher name
            createdAt: l.created_at
        }));

        return NextResponse.json({
            students,
            teachers,
            lessons,
            periods: [],
            timeTable: {}
        });
    } catch (error) {
        console.error("Error fetching grade details:", error);
        return NextResponse.json(
            { error: "Failed to fetch grade details" },
            { status: 500 }
        );
    }
}

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ level: string }> }
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
        const { level } = await params;
        const body = await request.json();

        const { data: updatedGrade, error } = await supabase
            .from('grades')
            .update({
                ...body,
                updated_at: new Date().toISOString()
            })
            .eq('level', level)
            .select('*')
            .maybeSingle();

        if (error) throw error;

        if (!updatedGrade) {
            return NextResponse.json(
                { error: "Grade not found" },
                { status: 404 }
            );
        }

        return NextResponse.json(updatedGrade);
    } catch (error) {
        console.error("Error updating grade:", error);
        return NextResponse.json(
            { error: "Failed to update grade" },
            { status: 500 }
        );
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ level: string }> }
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
        const { level } = await params;

        const { data: deletedGrade, error } = await supabase
            .from('grades')
            .delete()
            .eq('level', level)
            .select('level')
            .maybeSingle();

        if (error) throw error;

        if (!deletedGrade) {
            return NextResponse.json(
                { error: "Grade not found" },
                { status: 404 }
            );
        }

        return NextResponse.json({ message: "Grade deleted successfully" });
    } catch (error) {
        console.error("Error deleting grade:", error);
        return NextResponse.json(
            { error: "Failed to delete grade" },
            { status: 500 }
        );
    }
}