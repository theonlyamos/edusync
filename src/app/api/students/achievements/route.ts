import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { summarizeAchievements } from '@/lib/achievements';
import { practiceStreak } from '@/lib/practice-stats';
import { getActiveSchoolMembership } from '@/lib/school-access.server';
import { createServerSupabase } from '@/lib/supabase.server';

const DAY = 24 * 60 * 60 * 1000;

/** The signed-in student's streak and badges, worked out from what they have already done. */
export async function GET() {
  try {
    const session = await getServerSession();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.user.role !== 'student') return NextResponse.json({ error: 'Badges are for students' }, { status: 403 });
    const userId = session.user.id;
    const supabase = createServerSupabase();

    const [membership, recent, sets, perfect, homework, passed] = await Promise.all([
      getActiveSchoolMembership(supabase, userId),
      supabase.from('practice_results').select('completedat').eq('student_id', userId).gte('completedat', new Date(Date.now() - 400 * DAY).toISOString()).order('completedat', { ascending: false }).limit(1000),
      supabase.from('practice_results').select('id', { count: 'exact', head: true }).eq('student_id', userId),
      supabase.from('practice_results').select('id', { count: 'exact', head: true }).eq('student_id', userId).eq('score->>percentage', '100'),
      supabase.from('homework_attempts').select('homework_id').eq('student_id', userId).not('submitted_at', 'is', null).limit(2000),
      supabase.from('assessment_results').select('id', { count: 'exact', head: true }).eq('student_id', userId).eq('status', 'passed'),
    ]);
    for (const result of [recent, sets, perfect, homework, passed]) if (result.error) throw result.error;

    return NextResponse.json(
      summarizeAchievements({
        // A day is the school's day, so late-evening practice counts for today.
        streak: practiceStreak((recent.data ?? []).map((row) => row.completedat as string), membership?.school.timezone || 'UTC'),
        practiceSets: sets.count ?? 0,
        perfectSets: perfect.count ?? 0,
        // Several attempts at one piece of homework count once.
        homeworkHandedIn: new Set((homework.data ?? []).map((row) => row.homework_id as string)).size,
        assessmentsPassed: passed.count ?? 0,
      }),
    );
  } catch (error) {
    console.error('[GET /api/students/achievements]', error);
    return NextResponse.json({ error: 'Could not load your badges' }, { status: 500 });
  }
}
