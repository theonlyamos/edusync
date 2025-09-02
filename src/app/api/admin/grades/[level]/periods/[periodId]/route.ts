import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function PUT(
    request: Request,
    { params }: { params: { level: string; periodId: string } }
) {
    try {
        const body = await request.json();
        const { data: existing, error } = await supabase
            .from('timetables')
            .select('periods')
            .eq('grade', params.level)
            .maybeSingle();
        if (error) throw error;
        if (!existing) {
            return NextResponse.json(
                { error: "Grade or period not found" },
                { status: 404 }
            );
        }

        const periods = ([...(existing as any).periods] || []).map((p: any) => (
            p.id === params.periodId || p._id === params.periodId ? { ...p, ...body, id: p.id || p._id } : p
        ));
        const { error: updErr } = await supabase
            .from('timetables')
            .update({ periods })
            .eq('grade', params.level);
        if (updErr) throw updErr;

        const updatedPeriod = periods.find((p: any) => p.id === params.periodId || p._id === params.periodId);
        return NextResponse.json(updatedPeriod || null);
    } catch (error) {
        console.error("Error updating period:", error);
        return NextResponse.json(
            { error: "Failed to update period" },
            { status: 500 }
        );
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: { level: string; periodId: string } }
) {
    try {
        const { data: existing, error } = await supabase
            .from('timetables')
            .select('periods')
            .eq('grade', params.level)
            .maybeSingle();
        if (error) throw error;
        if (!existing) {
            return NextResponse.json(
                { error: "Grade not found" },
                { status: 404 }
            );
        }

        const periods = ([...(existing as any).periods] || []).filter((p: any) => (p.id ?? p._id) !== params.periodId);
        const { error: updErr } = await supabase
            .from('timetables')
            .update({ periods })
            .eq('grade', params.level);
        if (updErr) throw updErr;

        return NextResponse.json({ message: "Period deleted successfully" });
    } catch (error) {
        console.error("Error deleting period:", error);
        return NextResponse.json(
            { error: "Failed to delete period" },
            { status: 500 }
        );
    }
} 