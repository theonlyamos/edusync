import { NextResponse } from 'next/server';
import { z } from 'zod';

import { setLessonArchived } from '@/lib/lesson-artifacts/lesson-lifecycle';
import { lessonArtifactErrorResponse, requireLessonManager } from '@/lib/lesson-artifacts/server';

const archiveSchema = z.object({ archived: z.boolean() });

/** Archives a lesson, or restores an archived one. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  try {
    const { lessonId } = await params;
    const { archived } = archiveSchema.parse(await request.json());
    const { supabase } = await requireLessonManager(lessonId);
    await setLessonArchived(supabase, lessonId, archived);
    return NextResponse.json({ archived });
  } catch (error) {
    return lessonArtifactErrorResponse(error);
  }
}
