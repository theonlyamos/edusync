import { NextResponse } from 'next/server';
import { createSSRUserSupabase } from '@/lib/supabase.server';
import { practiceStatsFromRow, practiceStreak } from '@/lib/practice-stats';

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

        const { data: row, error } = await supabase
            .from('student_stats')
            .select('studentid,totalexercisescompleted,totalpointsearned,recentscores,lastpracticedate')
            .eq('studentid', user.id)
            .maybeSingle();
        if (error) throw error;

        const since = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString();
        const { data: recent, error: recentError } = await supabase
            .from('practice_results')
            .select('completedat')
            .eq('student_id', user.id)
            .gte('completedat', since)
            .order('completedat', { ascending: false })
            .limit(1000);
        if (recentError) throw recentError;

        return NextResponse.json({
            ...practiceStatsFromRow(user.id, row),
            currentStreak: practiceStreak((recent ?? []).map((r) => r.completedat as string)),
        });
    } catch (error) {
        console.error('Error fetching practice stats:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
