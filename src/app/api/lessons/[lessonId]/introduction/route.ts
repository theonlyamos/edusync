import { NextResponse } from 'next/server';
import { requireLessonViewer } from '@/lib/lesson-artifacts/lesson-read-server';
import { toStudentSafeArtifact } from '@/lib/lesson-artifacts/domain';
import { lessonArtifactErrorResponse, mapArtifactRow } from '@/lib/lesson-artifacts/server';

export async function GET(_request: Request, { params }: { params: Promise<{ lessonId: string }> }) {
  try {
    const { lessonId } = await params;
    const { session, supabase } = await requireLessonViewer(lessonId);
    let query = supabase.from('lesson_artifacts').select('*').eq('lesson_id', lessonId)
      .is('objective_id', null).eq('kind', 'generated_image').eq('status', 'approved');
    if (session.user.role === 'student') {
      const { data: lesson, error } = await supabase.from('lessons').select('current_publication_id').eq('id', lessonId).single();
      if (error) throw error;
      if (!lesson.current_publication_id) return NextResponse.json({ artifact: null });
      const { data: publication, error: publicationError } = await supabase.from('lesson_publications').select('manifest')
        .eq('id', lesson.current_publication_id).eq('lesson_id', lessonId).single();
      if (publicationError) throw publicationError;
      const id = publication.manifest?.lesson?.introductionArtifactId;
      if (!id) return NextResponse.json({ artifact: null });
      query = query.eq('id', id);
    }
    const { data, error } = await query.order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return NextResponse.json({ artifact: data ? toStudentSafeArtifact(mapArtifactRow(data)) : null });
  } catch (error) { return lessonArtifactErrorResponse(error); }
}
