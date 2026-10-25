import { NextResponse } from 'next/server';
import { createSSRUserSupabase } from '@/lib/supabase.server';
import { readTimetable } from '@/lib/timetable';

/** The timetable for the signed-in student's class (or, without one, their grade) in their school. */
export async function GET() {
    try {
        const supabase = await createSSRUserSupabase();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return new NextResponse('Unauthorized', { status: 401 });

        const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle();
        if (userData?.role !== 'student') {
            return new NextResponse('Unauthorized - Student access required', { status: 403 });
        }

        const { data: student, error: studentError } = await supabase
            .from('students')
            .select('grade, organization_id')
            .eq('user_id', user.id)
            .maybeSingle();
        if (studentError) throw studentError;
        if (!student?.grade || !student.organization_id) {
            return NextResponse.json({ timeTable: {}, periods: [] });
        }

        // Their class's timetable when it has one, otherwise the whole grade's.
        const { data: membership } = await supabase
            .from('school_class_students')
            .select('class_id')
            .eq('student_id', user.id)
            .maybeSingle();
        const findTimetable = async (classId: string | null) => {
            let query = supabase
                .from('timetables')
                .select('periods, schedule')
                .eq('organization_id', student.organization_id)
                .eq('grade', student.grade);
            query = classId ? query.eq('class_id', classId) : query.is('class_id', null);
            const { data, error } = await query.order('updated_at', { ascending: false }).limit(1).maybeSingle();
            if (error) throw error;
            return data;
        };
        const row = (membership?.class_id ? await findTimetable(membership.class_id as string) : null) ?? await findTimetable(null);
        const timetable = readTimetable(row);

        const teacherIds = [...new Set(Object.values(timetable.schedule).flatMap((cells) => Object.values(cells).map((c) => c.teacherId)).filter(Boolean))];
        const { data: teachers } = teacherIds.length
            ? await supabase.from('users').select('id, name').in('id', teacherIds)
            : { data: [] as Array<{ id: string; name: string | null }> };
        const names = new Map((teachers ?? []).map((t: any) => [String(t.id), t.name as string | null]));

        const timeTable: Record<string, Record<string, { subject: string; teacherId: string; teacherName: string }>> = {};
        for (const [day, cells] of Object.entries(timetable.schedule)) {
            for (const [periodId, cell] of Object.entries(cells)) {
                (timeTable[day] ??= {})[periodId] = {
                    ...cell,
                    teacherName: (cell.teacherId && names.get(cell.teacherId)) || 'No teacher assigned',
                };
            }
        }

        return NextResponse.json({ timeTable, periods: timetable.periods });
    } catch (error) {
        console.error('[TIMETABLE_GET]', error);
        return new NextResponse('Internal Error', { status: 500 });
    }
}
