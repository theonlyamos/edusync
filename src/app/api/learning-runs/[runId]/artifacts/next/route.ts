import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { resolveNextLearningArtifact } from '@/lib/lesson-artifacts/learning-server';
import { lessonArtifactErrorResponse } from '@/lib/lesson-artifacts/server';
import { rateLimit } from '@/lib/rate-limiter';

const schema = z.object({
  kind: z.enum(['visualization', 'quiz']),
  requestId: z.string().trim().min(1).max(160),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const rateLimitResponse = await rateLimit(request, 'tutor');
    if (rateLimitResponse) return rateLimitResponse;
    const { runId } = await params;
    const input = schema.parse(await request.json());
    return NextResponse.json(await resolveNextLearningArtifact({ runId, ...input }));
  } catch (error) {
    return lessonArtifactErrorResponse(error);
  }
}
