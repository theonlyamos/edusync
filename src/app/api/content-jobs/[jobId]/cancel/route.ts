import { NextResponse } from 'next/server';

import { getServerSession } from '@/lib/auth';
import { lessonArtifactErrorResponse, LessonArtifactHttpError } from '@/lib/lesson-artifacts/server';
import { createServerSupabase } from '@/lib/supabase.server';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const session = await getServerSession();
    if (!session?.user?.id || !['admin', 'teacher'].includes(session.user.role ?? '')) {
      throw new LessonArtifactHttpError(401, 'Teacher or admin access required');
    }
    const { jobId } = await params;
    const supabase = createServerSupabase();
    let query = supabase.from('content_jobs').update({ status: 'cancelled', completed_at: new Date().toISOString() })
      .eq('id', jobId).eq('status', 'queued');
    if (session.user.role !== 'admin') query = query.eq('requested_by', session.user.id);
    const { data, error } = await query.select('*').maybeSingle();
    if (error) throw error;
    if (!data) throw new LessonArtifactHttpError(409, 'Only queued jobs can be cancelled');
    return NextResponse.json(data);
  } catch (error) {
    return lessonArtifactErrorResponse(error);
  }
}
