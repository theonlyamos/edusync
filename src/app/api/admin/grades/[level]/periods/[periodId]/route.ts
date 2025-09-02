import { NextResponse, NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ level: string; periodId: string }> }
) {
    const { level, periodId } = await params;
    try {
        const body = await request.json();
        const { data: existing, error } = await supabase
            .from('timetables')
            .select('periods')
            .eq('grade', level)
            .maybeSingle();
        if (error) throw error;
        if (!existing) {
            return NextResponse.json(
                { error: "Grade or period not found" },
                { status: 404 }
            );
        }

        const rawPeriods: any[] = Array.isArray((existing as any).periods) ? (existing as any).periods : [];
        const periods = rawPeriods.map((p: any) => (
            p.id === periodId || p._id === periodId ? { ...p, ...body, id: p.id || p._id } : p
        ));
        const { error: updErr } = await supabase
            .from('timetables')
            .update({ periods })
            .eq('grade', level);
        if (updErr) throw updErr;

        const updatedPeriod = periods.find((p: any) => p.id === periodId || p._id === periodId);
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
    request: NextRequest,
    { params }: { params: Promise<{ level: string; periodId: string }> }
) {
    const { level, periodId } = await params;
    try {
        const { data: existing, error } = await supabase
            .from('timetables')
            .select('periods')
            .eq('grade', level)
            .maybeSingle();
        if (error) throw error;
        if (!existing) {
            return NextResponse.json(
                { error: "Grade not found" },
                { status: 404 }
            );
        }

        const rawPeriods: any[] = Array.isArray((existing as any).periods) ? (existing as any).periods : [];
        const periods = rawPeriods.filter((p: any) => (p.id ?? p._id) !== periodId);
        const { error: updErr } = await supabase
            .from('timetables')
            .update({ periods })
            .eq('grade', level);
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