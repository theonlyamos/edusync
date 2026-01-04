import { NextResponse, NextRequest } from 'next/server';
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

        const { data: timetable, error } = await supabase
            .from('timetables')
            .select('periods')
            .eq('grade', decodedLevel)
            .maybeSingle();

        if (error) throw error;

        return NextResponse.json((timetable as any)?.periods || []);
    } catch (error) {
        console.error("Error fetching periods:", error);
        return NextResponse.json(
            { error: "Failed to fetch periods" },
            { status: 500 }
        );
    }
}

export async function POST(
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
        const body = await request.json();

        // Generate a unique id for the new period
        const newPeriod = {
            id: crypto.randomUUID(),
            startTime: body.startTime || '08:00',
            endTime: body.endTime || '09:00'
        };

        const { data: existing, error: err } = await supabase
            .from('timetables')
            .select('periods')
            .eq('grade', decodedLevel)
            .maybeSingle();

        if (err) throw err;

        let periods: any[];
        if (!existing) {
            // Create new timetable entry
            const { error: insertErr } = await supabase
                .from('timetables')
                .insert({ grade: decodedLevel, periods: [newPeriod], schedule: {} });
            if (insertErr) throw insertErr;
            periods = [newPeriod];
        } else {
            // Update existing timetable
            periods = [...((existing as any).periods || []), newPeriod];
            const { error: updErr } = await supabase
                .from('timetables')
                .update({ periods })
                .eq('grade', decodedLevel);
            if (updErr) throw updErr;
        }

        return NextResponse.json(newPeriod, { status: 201 });
    } catch (error) {
        console.error("Error creating period:", error);
        return NextResponse.json(
            { error: "Failed to create period" },
            { status: 500 }
        );
    }
}