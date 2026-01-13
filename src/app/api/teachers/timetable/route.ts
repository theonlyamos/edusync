import { NextResponse } from 'next/server';
import { createSSRUserSupabase } from '@/lib/supabase.server';

export async function GET(request: Request) {
    try {
        const supabase = await createSSRUserSupabase();
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        // Verify user is a teacher
        const { data: userData } = await supabase
            .from('users')
            .select('role')
            .eq('id', user.id)
            .maybeSingle();

        if (!userData || userData.role !== 'teacher') {
            return new NextResponse('Unauthorized - Teacher access required', { status: 403 });
        }

        const { data: timetables, error: tErr } = await supabase
            .from('timetables')
            .select('*');
        if (tErr) throw tErr;

        // Get all periods from all grade levels
        const allPeriods: any[] = [];
        const filteredTimeTable: any = {};

        // Filter and collect all periods where this teacher is assigned
        (timetables ?? []).forEach((timetable: any) => {
            const schedule = (timetable?.schedule as Record<string, any> | undefined);
            if (schedule) {
                Object.entries(schedule).forEach(([day, periods]) => {
                    Object.entries(periods as Record<string, any>).forEach(([periodId, data]) => {
                        if (data.teacherId === user.id) {
                            if (!filteredTimeTable[day]) {
                                filteredTimeTable[day] = {};
                            }
                            filteredTimeTable[day][periodId] = {
                                ...data,
                                level: timetable.level
                            };

                            // Add period to allPeriods if not already included
                            const periodData = timetable.periods?.find((p: any) => p.id === periodId);
                            if (periodData && !allPeriods.some(p => p.id === periodId)) {
                                allPeriods.push({
                                    ...periodData,
                                    level: timetable.level
                                });
                            }
                        }
                    });
                });
            }
        });

        // Sort periods by start time
        allPeriods.sort((a, b) => a.startTime.localeCompare(b.startTime));

        // Get the teacher's lessons
        const { data: lessons } = await supabase
            .from('lessons')
            .select('id, title, teacher')
            .eq('teacher', user.id);

        return NextResponse.json({
            timeTable: filteredTimeTable,
            lessons: (lessons ?? []).map(lesson => ({
                ...lesson,
                _id: String((lesson as any)._id ?? lesson.id)
            })),
            periods: allPeriods
        });
    } catch (error) {
        console.error('[TIMETABLE_GET]', error);
        return new NextResponse('Internal Error', { status: 500 });
    }
}

export async function PUT(request: Request) {
    try {
        const supabase = await createSSRUserSupabase();
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        // Verify user is a teacher
        const { data: userData } = await supabase
            .from('users')
            .select('role')
            .eq('id', user.id)
            .maybeSingle();

        if (!userData || userData.role !== 'teacher') {
            return new NextResponse('Unauthorized - Teacher access required', { status: 403 });
        }

        const { timeTable, level } = await request.json();

        if (!level) {
            return new NextResponse('Grade level is required', { status: 400 });
        }

        const { data: currentTimetable } = await supabase
            .from('timetables')
            .select('*')
            .eq('level', level)
            .maybeSingle();

        // Merge the existing timetable with the teacher's updates
        const updatedSchedule = { ...(currentTimetable?.schedule || {}) };
        Object.entries(timeTable).forEach(([day, periods]: [string, any]) => {
            updatedSchedule[day] = updatedSchedule[day] || {};
            Object.entries(periods).forEach(([period, data]) => {
                const objData = (data ?? {}) as Record<string, any>;
                updatedSchedule[day][period] = {
                    ...objData,
                    teacherId: user.id // Ensure teacherId is set correctly
                };
            });
        });

        const payload = { schedule: updatedSchedule, updatedAt: new Date().toISOString(), level } as any;
        if (currentTimetable) {
            const { error } = await supabase
                .from('timetables')
                .update(payload)
                .eq('level', level);
            if (error) throw error;
        } else {
            const { error } = await supabase
                .from('timetables')
                .insert({ ...payload, createdAt: new Date().toISOString() });
            if (error) throw error;
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error updating timetable:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
