import { NextResponse, NextRequest } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase.server';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ level: string }> }
) {
    const supabase = createServerSupabase();
    try {
        const session = await getServerSession();
        if (!session || session.user?.role !== 'admin') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { level } = await params;
        const { data: timetable, error } = await supabase
            .from('timetables')
            .select('*')
            .eq('grade', level)
            .maybeSingle();
        if (error) throw error;

        if (!timetable) {
            return NextResponse.json(
                { error: "Timetable not found" },
            );
        }

        return NextResponse.json(timetable);
    } catch (error) {
        console.error("Error fetching timetable:", error);
        return NextResponse.json(
            { error: "Failed to fetch timetable" },
            { status: 500 }
        );
    }
}

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ level: string }> }
) {
    const supabase = createServerSupabase();
    try {
        const session = await getServerSession();
        if (!session || session.user?.role !== 'admin') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const body = await request.json();
        const { level } = await params;

        const currentYear = new Date().getFullYear();
        const academicYear = `${currentYear}-${currentYear + 1}`;

        const payload = { ...body, grade: level, academicYear, updatedAt: new Date().toISOString() } as any;
        const { data: existing } = await supabase
            .from('timetables')
            .select('id')
            .eq('grade', level)
            .maybeSingle();

        let updatedTimetable;
        if (existing) {
            const { data, error } = await supabase
                .from('timetables')
                .update(payload)
                .eq('grade', level)
                .select('*')
                .maybeSingle();
            if (error) throw error;
            updatedTimetable = data;
        } else {
            const { data, error } = await supabase
                .from('timetables')
                .insert(payload)
                .select('*')
                .maybeSingle();
            if (error) throw error;
            updatedTimetable = data;
        }

        if (!updatedTimetable) {
            return NextResponse.json(
                { error: "Failed to update timetable" },
                { status: 404 }
            );
        }

        return NextResponse.json(updatedTimetable);
    } catch (error) {
        console.error("Error updating timetable:", error);
        return NextResponse.json(
            { error: "Failed to update timetable" },
            { status: 500 }
        );
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ level: string }> }
) {
    const supabase = createServerSupabase();
    try {
        const session = await getServerSession();
        if (!session || session.user?.role !== 'admin') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { level } = await params;
        const { data: deletedTimetable, error } = await supabase
            .from('timetables')
            .delete()
            .eq('grade', level)
            .select('id')
            .maybeSingle();
        if (error) throw error;

        if (!deletedTimetable) {
            return NextResponse.json(
                { error: "Timetable not found" },
                { status: 404 }
            );
        }

        return NextResponse.json({ message: "Timetable deleted successfully" });
    } catch (error) {
        console.error("Error deleting timetable:", error);
        return NextResponse.json(
            { error: "Failed to delete timetable" },
            { status: 500 }
        );
    }
} 