import { NextResponse } from 'next/server';
import { createSSRUserSupabase } from '@/lib/supabase.server';

export async function GET() {
    try {
        const supabase = await createSSRUserSupabase();
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        // Verify user is a student
        const { data: userData } = await supabase
            .from('users')
            .select('role')
            .eq('id', user.id)
            .maybeSingle();

        if (!userData || userData.role !== 'student') {
            return new NextResponse('Unauthorized - Student access required', { status: 403 });
        }

        const { data: statsRaw } = await supabase
            .from('student_stats')
            .select('*')
            .eq('studentId', user.id)
            .maybeSingle();
        const stats = statsRaw || {
            studentId: user.id,
            totalExercisesCompleted: 0,
            totalPointsEarned: 0,
            recentScores: [] as number[],
            currentStreak: 0,
            averageScore: 0
        };

        // Calculate average score from recent scores
        const averageScore = (stats.recentScores?.length ?? 0) > 0
            ? Math.round((stats.recentScores as number[]).reduce((a: number, b: number) => a + b, 0) / (stats.recentScores as number[]).length)
            : 0;

        return NextResponse.json({
            ...stats,
            averageScore
        });
    } catch (error) {
        console.error('Error fetching practice stats:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
