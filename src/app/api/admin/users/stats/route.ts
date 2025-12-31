import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { createSSRUserSupabase } from '@/lib/supabase.server';

export async function GET(req: Request) {
    try {
        const session = await getServerSession();
        if (!session || session.user?.role !== 'admin') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const supabase = await createSSRUserSupabase();

        // Parallelize queries for performance
        const [
            { count: totalUsers },
            { count: totalStudents },
            { count: totalTeachers },
            { count: totalLessons },
            { count: totalAdmins },
            { count: activeUsers }
        ] = await Promise.all([
            supabase.from('users').select('*', { count: 'exact', head: true }),
            supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'student'),
            supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'teacher'),
            supabase.from('lessons').select('*', { count: 'exact', head: true }),
            supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'admin'),
            supabase.from('users').select('*', { count: 'exact', head: true }).gte('lastlogin', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        ]);

        return NextResponse.json({
            totalUsers: totalUsers || 0,
            totalStudents: totalStudents || 0,
            totalTeachers: totalTeachers || 0,
            totalAdmins: totalAdmins || 0,
            totalLessons: totalLessons || 0,
            activeUsers: activeUsers || 0
        });
    } catch (error) {
        console.error('Error fetching admin user stats:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
