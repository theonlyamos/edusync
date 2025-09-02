import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(
    request: Request,
    context: any
) {
    const { params } = context as { params: { level: string } };
    try {
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
    request: Request,
    context: any
) {
    const { params } = context as { params: { level: string } };
    try {
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
    request: Request,
    context: any
) {
    const { params } = context as { params: { level: string } };
    try {
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