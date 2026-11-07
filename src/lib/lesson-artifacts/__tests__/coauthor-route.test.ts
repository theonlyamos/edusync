import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ manager: vi.fn(), ai: vi.fn(), cap: vi.fn(), concepts: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/ai', () => ({ generateAICompletion: mocks.ai }));
vi.mock('@/lib/daily-caps', () => ({ enforceDailyCap: mocks.cap }));
vi.mock('@/lib/lesson-artifacts/accepted-concepts.server', () => ({ loadAcceptedConcepts: mocks.concepts }));
vi.mock('@/lib/lesson-artifacts/server', async (original) => ({ ...await original<typeof import('../server')>(), requireLessonManager: mocks.manager }));

const OBJECTIVE = '11111111-1111-4111-8111-111111111111';
const lesson = { id: 'lesson', title: 'Motion', subject: 'Science', gradelevel: '6', content: null, visual_instructions: null };

function query(data: unknown) {
  const result = { data, error: null };
  const builder: Record<string, unknown> = { then: Promise.resolve(result).then.bind(Promise.resolve(result)) };
  for (const method of ['select', 'eq', 'in', 'is', 'order']) builder[method] = vi.fn(() => builder);
  return builder;
}

function harness() {
  const from = vi.fn((table: string) => {
    if (table === 'lesson_objectives') return query([{ id: OBJECTIVE, text: 'Explain forces.', position: 0, revision: 1, visual_instructions: null }]);
    if (table === 'lesson_artifacts') return query([]);
    throw new Error(`Unexpected table ${table}`);
  });
  mocks.manager.mockResolvedValue({ supabase: { from }, session: { user: { id: 'teacher' } }, lesson });
  return { from };
}

const call = async (body: unknown) => {
  const { POST } = await import('@/app/api/teachers/lessons/[lessonId]/coauthor/route');
  return POST(new Request('http://localhost/api/test', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }), { params: Promise.resolve({ lessonId: 'lesson' }) });
};
const teacherSays = { messages: [{ role: 'teacher', text: 'Rename objective 1' }], focus: { step: 'direction' } };

describe('lesson co-author route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cap.mockResolvedValue(null);
    mocks.concepts.mockResolvedValue({});
    mocks.ai.mockResolvedValue(JSON.stringify({
      reply: 'Here is a clearer wording.',
      proposals: [{ type: 'objectives', summary: 'Reword objective 1', objectives: [{ id: OBJECTIVE, text: 'Describe balanced forces.' }] }, { type: 'regenerate', summary: 'Ghost', artifactId: 'nope', feedback: 'x' }],
    }));
  });

  it('checks the teacher can manage the lesson, then returns a reply with checked proposals', async () => {
    harness();
    const response = await call(teacherSays);
    expect(mocks.manager).toHaveBeenCalledWith('lesson');
    expect(mocks.cap).toHaveBeenCalledWith('coauthor', 'teacher');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      reply: 'Here is a clearer wording.',
      proposals: [{ type: 'objectives', summary: 'Reword objective 1', objectives: [{ id: OBJECTIVE, text: 'Describe balanced forces.' }] }],
    });
    const [system, user, functions, json] = mocks.ai.mock.calls[0];
    expect(system).toContain('lesson co-author');
    expect(user).toContain(`[${OBJECTIVE}] Explain forces.`);
    expect(user).toContain('Teacher: Rename objective 1');
    expect(functions).toBeUndefined();
    expect(json).toBe(true);
  });

  it('refuses people who cannot manage the lesson before calling the model', async () => {
    const { LessonArtifactHttpError } = await import('../server');
    mocks.manager.mockRejectedValue(new LessonArtifactHttpError(403, 'Not authorized to manage this lesson'));
    const response = await call(teacherSays);
    expect(response.status).toBe(403);
    expect(mocks.ai).not.toHaveBeenCalled();
  });

  it('stops at the daily cap', async () => {
    harness();
    mocks.cap.mockResolvedValue(new Response(JSON.stringify({ error: 'cap' }), { status: 429 }));
    const response = await call(teacherSays);
    expect(response.status).toBe(429);
    expect(mocks.ai).not.toHaveBeenCalled();
  });

  it('rejects bad requests and reports model failures plainly', async () => {
    harness();
    expect((await call('{')).status).toBe(400);
    expect((await call({ messages: [] })).status).toBe(400);
    mocks.ai.mockRejectedValueOnce(new Error('402'));
    const failed = await call(teacherSays);
    expect(failed.status).toBe(502);
    expect((await failed.json()).error).toContain('unavailable');
  });
});
