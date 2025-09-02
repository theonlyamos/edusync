import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { supabase } from '@/lib/supabase';
import { authOptions } from '@/lib/auth';
import { GRADE_LEVELS } from '@/lib/constants';

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'admin') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const gradeStats = await Promise.all(GRADE_LEVELS.map(async (level) => {
            const { count: studentCount } = await supabase
                .from('students')
                .select('*', { count: 'exact', head: true })
                .eq('grade', level);

            const { count: teacherCount } = await supabase
                .from('teachers')
                .select('*', { count: 'exact', head: true })
                .contains('grades', [level]);

            const { count: lessonCount } = await supabase
                .from('lessons')
                .select('*', { count: 'exact', head: true })
                .eq('gradeLevel', level);

            return { level, studentCount: studentCount ?? 0, teacherCount: teacherCount ?? 0, lessonCount: lessonCount ?? 0 };
        }));

        return NextResponse.json(gradeStats);
    } catch (error) {
        console.error('Error fetching grade statistics:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
} 