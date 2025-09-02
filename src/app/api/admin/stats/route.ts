import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { supabase } from '@/lib/supabase';
import { authOptions } from '@/lib/auth';

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'admin') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { count: totalStudents } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true })
            .eq('role', 'student');

        const { count: totalTeachers } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true })
            .eq('role', 'teacher');

        const { count: totalLessons } = await supabase
            .from('lessons')
            .select('*', { count: 'exact', head: true });

        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { count: activeUsers } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true })
            .gte('lastLogin', twentyFourHoursAgo);

        return NextResponse.json({
            totalStudents,
            totalTeachers,
            totalLessons,
            activeUsers
        });
    } catch (error) {
        console.error('Error fetching admin stats:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
} 