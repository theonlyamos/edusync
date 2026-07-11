import { NextResponse } from 'next/server';

import { getServerSession } from '@/lib/auth';
import { generateAICompletion } from '@/lib/ai';
import {
  generateLessonDraftWithRetry,
  lessonDraftGenerationSchema,
} from '@/lib/lesson-artifacts/authoring';
import { lessonArtifactErrorResponse, LessonArtifactHttpError } from '@/lib/lesson-artifacts/server';

export async function POST(request: Request) {
  try {
    const session = await getServerSession();
    if (!session?.user?.id || !['admin', 'teacher'].includes(session.user.role ?? '')) {
      throw new LessonArtifactHttpError(401, 'Teacher or admin access required');
    }

    const input = lessonDraftGenerationSchema.parse(await request.json());
    const draft = await generateLessonDraftWithRetry(
      input,
      (systemPrompt, userPrompt) => generateAICompletion(
        systemPrompt,
        userPrompt,
        undefined,
        true,
        0.3,
      ),
    );
    return NextResponse.json(draft);
  } catch (error) {
    return lessonArtifactErrorResponse(error);
  }
}
