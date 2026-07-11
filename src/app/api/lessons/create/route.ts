import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getServerSession } from '@/lib/auth';
import { lessonArtifactErrorResponse, LessonArtifactHttpError } from '@/lib/lesson-artifacts/server';
import { createServerSupabase } from '@/lib/supabase.server';

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
    const { data: memberships, error: membershipError } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', session.user.id)
      .eq('is_active', true);
    if (membershipError) throw membershipError;
    const organizationId = input.organizationId ?? (memberships?.length === 1 ? memberships[0].organization_id : null);
    if (memberships && memberships.length > 1 && !input.organizationId) {
      throw new LessonArtifactHttpError(400, 'Select the organization that owns this lesson');
    }
    if (organizationId && !memberships?.some((membership) => membership.organization_id === organizationId)) {
      throw new LessonArtifactHttpError(403, 'You are not a member of the selected organization');
    }
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
