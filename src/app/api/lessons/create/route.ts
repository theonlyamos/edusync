import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getServerSession } from '@/lib/auth';
import { lessonArtifactErrorResponse, LessonArtifactHttpError } from '@/lib/lesson-artifacts/server';
import { createServerSupabase } from '@/lib/supabase.server';
import { getUserSchoolId } from '@/lib/school';

const createLessonSchema = z.object({
  title: z.string().trim().min(1).max(160),
  subject: z.string().trim().min(1).max(120),
  gradeLevel: z.string().trim().min(1).max(80),
  objectives: z.array(z.string().trim().min(1).max(500)).min(1).max(20),
  content: z.string().max(100_000).nullable().default(null),
  organizationId: z.string().uuid().nullable().optional(),
});

export async function POST(request: Request) {
  try {
    const session = await getServerSession();
    if (!session?.user?.id || !['teacher', 'admin'].includes(session.user.role ?? '')) {
      throw new LessonArtifactHttpError(401, 'Teacher or admin access required');
    }
    const input = createLessonSchema.parse(await request.json());
    const supabase = createServerSupabase();
    // Lessons belong to the author's school. Developer organizations (API keys)
    // never own lessons, or school students could not open them.
    const schoolId = await getUserSchoolId(supabase, session.user.id);
    if (input.organizationId && input.organizationId !== schoolId) {
      throw new LessonArtifactHttpError(403, 'Lessons can only be created for your own school');
    }
    const organizationId = schoolId;
    const { data: lessonId, error } = await supabase.rpc('create_lesson_draft', {
      p_title: input.title,
      p_subject: input.subject,
      p_grade_level: input.gradeLevel,
      p_content: input.content,
      p_objectives: input.objectives,
      p_organization_id: organizationId,
      p_owner_user_id: session.user.id,
    });
    if (error) throw error;
    return NextResponse.json({ id: lessonId, message: 'Lesson draft created' }, { status: 201 });
  } catch (error) {
    return lessonArtifactErrorResponse(error);
  }
}
