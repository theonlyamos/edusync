import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { supabase } from '@/lib/supabase';
import { authOptions } from '@/lib/auth';

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'student') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { data: studentRow, error: studentErr } = await supabase
            .from('students_view')
            .select('grade')
            .eq('id', session.user.id)
            .maybeSingle();
        if (studentErr) throw studentErr;

        if (!studentRow?.grade) {
            return NextResponse.json({ timeTable: {} });
        }

        // Get the timetable for the student's grade
        const { data: timetable, error: tErr } = await supabase
            .from('timetables')
            .select('*')
            .eq('grade', studentRow.grade)
            .maybeSingle();
        if (tErr) throw tErr;

        // Get all teachers for this grade
        const { data: teachers } = await supabase
            .from('users')
            .select('id, name')
            .eq('role', 'teacher');

        // Get all lessons for this grade level
        const { data: lessons } = await supabase
            .from('lessons')
            .select('id, title, gradeLevel')
            .eq('gradeLevel', studentRow.grade);

        // Add teacher names and lesson titles to the timetable
        const timeTableWithDetails = { ...(timetable as any)?.schedule } as any;
        if (timeTableWithDetails) {
            Object.entries(timeTableWithDetails).forEach(([day, periods]: [string, any]) => {
                Object.entries(periods).forEach(([periodId, data]: [string, any]) => {
                    const teacher = (teachers || []).find((t: any) => String(t.id) === data.teacherId);
                    const lesson = (lessons || []).find((l: any) => String(l.id) === data.lessonId);

                    timeTableWithDetails[day][periodId] = {
                        ...data,
                        teacherName: teacher?.name || 'No teacher assigned',
                        lessonTitle: lesson?.title
                    };
                });
            });
        }

        // Sort periods by start time
        const periods = (timetable as any)?.periods || [];
        periods.sort((a: any, b: any) => a.startTime.localeCompare(b.startTime));

        return NextResponse.json({
            timeTable: timeTableWithDetails || {},
            lessons: (lessons ?? []).map(lesson => ({
                ...lesson,
                _id: String((lesson as any)._id ?? lesson.id)
            })),
            periods
        });
    } catch (error) {
        console.error('[TIMETABLE_GET]', error);
        return new NextResponse('Internal Error', { status: 500 });
    }
} 