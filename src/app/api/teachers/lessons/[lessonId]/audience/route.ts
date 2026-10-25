import { NextResponse } from 'next/server';
import { z } from 'zod';

import { lessonAudience, validAudienceClasses } from '@/lib/lesson-artifacts/audience.server';
import { LessonArtifactHttpError, lessonArtifactErrorResponse, requireLessonManager } from '@/lib/lesson-artifacts/server';

const schema = z.object({ classIds: z.array(z.string().uuid()).max(200) });

/** Sets which classes of the grade see the lesson. An empty list means the whole grade. */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  try {
    const { lessonId } = await params;
    const { classIds } = schema.parse(await request.json());
    const { supabase, lesson } = await requireLessonManager(lessonId);
    const valid = await validAudienceClasses(supabase, lesson.organization_id, lesson.gradelevel, classIds);
    if (!valid) throw new LessonArtifactHttpError(400, 'Pick classes from this lesson’s grade');
    const { error } = await supabase.from('lessons').update({ audience_class_ids: valid }).eq('id', lessonId);
    if (error) throw error;
    return NextResponse.json({ audience: await lessonAudience({ ...lesson, audience_class_ids: valid }) });
  } catch (error) {
    return lessonArtifactErrorResponse(error);
  }
}
