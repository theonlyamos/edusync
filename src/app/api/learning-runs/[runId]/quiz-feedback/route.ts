import { NextResponse } from 'next/server';

import { getQuizTutorFeedback } from '@/lib/lesson-artifacts/quiz-feedback-server';
import { lessonArtifactErrorResponse } from '@/lib/lesson-artifacts/server';

export async function GET(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const { runId } = await params;
    return NextResponse.json(await getQuizTutorFeedback(runId), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return lessonArtifactErrorResponse(error);
  }
}
