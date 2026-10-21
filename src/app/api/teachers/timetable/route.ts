import { NextResponse } from 'next/server';
import { createSSRUserSupabase } from '@/lib/supabase.server';
import { readTimetable, teacherSlots } from '@/lib/timetable';

/**
 * The signed-in teacher's slots across their school's grade timetables.
 * Read-only: the school's admins set the timetable on the school page.
 */
export async function GET() {
    try {
        const supabase = await createSSRUserSupabase();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return new NextResponse('Unauthorized', { status: 401 });

        const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle();
        if (userData?.role !== 'teacher') {
            return new NextResponse('Unauthorized - Teacher access required', { status: 403 });
        }

        // Row level security limits this to the teacher's own school.
        const { data: rows, error } = await supabase.from('timetables').select('grade, periods, schedule');
        if (error) throw error;

        const { periods, schedule } = teacherSlots(
            (rows ?? []).map((row: any) => ({ grade: row.grade as string, timetable: readTimetable(row) })),
            user.id,
        );
        return NextResponse.json({ timeTable: schedule, periods });
    } catch (error) {
        console.error('[TIMETABLE_GET]', error);
        return new NextResponse('Internal Error', { status: 500 });
    }
}
