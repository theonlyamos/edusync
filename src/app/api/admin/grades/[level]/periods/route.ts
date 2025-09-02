import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(
    request: Request,
    context: any
) {
    const { params } = context as { params: { level: string } };
    try {
        const { data: timetable, error } = await supabase
            .from('timetables')
            .select('periods')
            .eq('grade', params.level)
            .maybeSingle();
        if (error) throw error;

        if (!timetable) {
            return NextResponse.json(
                { error: "Grade not found" },
                { status: 404 }
            );
        }

        return NextResponse.json((timetable as any).periods || []);
    } catch (error) {
        console.error("Error fetching periods:", error);
        return NextResponse.json(
            { error: "Failed to fetch periods" },
            { status: 500 }
        );
    }
}

export async function POST(
    request: Request,
    context: any
) {
    const { params } = context as { params: { level: string } };
    try {
        const body = await request.json();
        const { data: existing, error: err } = await supabase
            .from('timetables')
            .select('periods')
            .eq('grade', params.level)
            .maybeSingle();
        if (err) throw err;
        if (!existing) {
            return NextResponse.json(
                { error: "Grade not found" },
                { status: 404 }
            );
        }

        const periods = [...(existing as any).periods || [], body];
        const { error: updErr } = await supabase
            .from('timetables')
            .update({ periods })
            .eq('grade', params.level);
        if (updErr) throw updErr;

        return NextResponse.json(periods);
    } catch (error) {
        console.error("Error creating period:", error);
        return NextResponse.json(
            { error: "Failed to create period" },
            { status: 500 }
        );
    }
} 