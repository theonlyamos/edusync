import { beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.fn();
const feedback = vi.fn();
const completion = vi.fn();
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase.server', () => ({ createSSRUserSupabase: database, createServerSupabase: vi.fn() }));
vi.mock('@/lib/rate-limiter', () => ({ rateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/lesson-artifacts/quiz-feedback-server', () => ({ getQuizTutorFeedback: feedback }));
vi.mock('@/lib/lesson-artifacts/learning-server', () => ({ retrieveLearningGrounding: vi.fn().mockResolvedValue([]), resolveNextLearningArtifact: vi.fn() }));
vi.mock('@/lib/ai', () => ({ generateAICompletion: completion }));
vi.mock('@/lib/visualize-ai-task', () => ({ runVisualizeGeneration: vi.fn() }));
vi.mock('@/lib/study-companion', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/study-companion')>(),
  assertLessonAccess: vi.fn().mockResolvedValue({ title: 'Fractions', subject: 'Math', objectives: 'Add fractions' }),
}));

const lessonId = '00000000-0000-4000-8000-000000000001';
const learningRunId = '00000000-0000-4000-8000-000000000002';
const chatId = '00000000-0000-4000-8000-000000000003';
function harness(existingLesson?: string) {
  const writes = vi.fn();
  database.mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: 'student' } } }) },
    from: (table: string) => {
      const result = { data: table === 'users' ? { role: 'student' } : table === 'students' ? { grade: '5' } : { id: chatId, userid: 'student', lessonid: existingLesson, messages: [] }, error: null };
      const chain = {
        select: () => chain, eq: () => chain,
        maybeSingle: async () => result, single: async () => result,
        insert: (value: unknown) => { writes(table, value); return chain; },
        update: (value: unknown) => { writes(table, value); return chain; },
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
      };
      return chain;
    },
  });
  return writes;
}
async function send(body: Record<string, unknown> = {}) {
  const { POST } = await import('@/app/api/tutor/route');
  return POST(new Request('http://localhost/api/tutor', { method: 'POST', body: JSON.stringify({ lessonId, learningRunId, content: 'Help me understand', ...body }) }) as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  feedback.mockResolvedValue({ context: 'Verified scoped quiz evidence' });
  completion.mockResolvedValue(JSON.stringify({ content: 'Try this next step.', mode: 'companion', intent: 'general' }));
});

describe('text tutor quiz evidence', () => {
  it('reads feedback for the effective chat lesson and adds it to the tutor prompt', async () => {
    const writes = harness(lessonId);
    const response = await send({ chatId, lessonId: '00000000-0000-4000-8000-000000000004' });
    expect(response.status).toBe(200);
    expect(feedback).toHaveBeenCalledWith(learningRunId, lessonId);
    expect(completion.mock.calls[0][0]).toContain('Verified scoped quiz evidence');
    expect(writes).toHaveBeenCalledTimes(2);
  });

  it.each([401, 403, 404, 409])('returns scope/access status %i before saving chat or calling AI', async (status) => {
    const writes = harness();
    const { LessonArtifactHttpError } = await import('../server');
    feedback.mockRejectedValueOnce(new LessonArtifactHttpError(status, 'Invalid learning run scope'));
    expect((await send()).status).toBe(status);
    expect(writes).not.toHaveBeenCalled();
    expect(completion).not.toHaveBeenCalled();
  });

  it('requires a lesson for run context and leaves ordinary tutor turns independent', async () => {
    const writes = harness();
    expect((await send({ lessonId: null })).status).toBe(400);
    expect(writes).not.toHaveBeenCalled();
    expect(feedback).not.toHaveBeenCalled();
    expect((await send({ lessonId: null, learningRunId: null })).status).toBe(200);
    expect(feedback).not.toHaveBeenCalled();
  });
});
