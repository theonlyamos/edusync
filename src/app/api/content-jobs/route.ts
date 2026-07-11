import { NextResponse } from 'next/server';

import { getServerSession } from '@/lib/auth';
import { lessonArtifactErrorResponse, LessonArtifactHttpError } from '@/lib/lesson-artifacts/server';
import { createServerSupabase } from '@/lib/supabase.server';

export async function GET(request: Request) {
  try {
    const session = await getServerSession();
    if (!session?.user?.id || !['admin', 'teacher'].includes(session.user.role ?? '')) {
      throw new LessonArtifactHttpError(401, 'Teacher or admin access required');
    }
    const batchId = new URL(request.url).searchParams.get('batchId');
    if (!batchId) throw new LessonArtifactHttpError(400, 'batchId is required');

    const supabase = createServerSupabase();
    let query = supabase.from('content_jobs').select('*').eq('batch_id', batchId).order('created_at');
    if (session.user.role !== 'admin') query = query.eq('requested_by', session.user.id);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ jobs: data ?? [] });
  } catch (error) {
    return lessonArtifactErrorResponse(error);
  }
}
