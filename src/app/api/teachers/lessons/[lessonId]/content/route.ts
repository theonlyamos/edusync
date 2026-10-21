import { NextResponse } from 'next/server';
import { z } from 'zod';

import { lessonArtifactErrorResponse, requireLessonManager } from '@/lib/lesson-artifacts/server';

const contentSchema = z.object({ content: z.string().max(100_000) });

/** Saves the lesson's written text. It is not used to generate materials, so approvals stay current. */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  try {
    const { lessonId } = await params;
    const { content } = contentSchema.parse(await request.json());
    const { supabase } = await requireLessonManager(lessonId);
    const next = content.trim() ? content : null;
    const { error } = await supabase
      .from('lessons')
      .update({ content: next, updated_at: new Date().toISOString() })
      .eq('id', lessonId);
    if (error) throw error;
    return NextResponse.json({ content: next });
  } catch (error) {
    return lessonArtifactErrorResponse(error);
  }
}
