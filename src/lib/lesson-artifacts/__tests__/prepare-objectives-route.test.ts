import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ manager: vi.fn(), suggest: vi.fn(), enqueue: vi.fn(), after: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/lesson-artifacts/objective-bundle.server', () => ({ suggestObjectiveConcept: mocks.suggest, enqueueObjectiveBundle: mocks.enqueue }));
vi.mock('@/lib/lesson-artifacts/job-processor.server', () => ({ processContentJobBatch: vi.fn() }));
vi.mock('next/server', async (original) => ({ ...await original<typeof import('next/server')>(), after: mocks.after }));
vi.mock('@/lib/lesson-artifacts/server', async (original) => ({ ...await original<typeof import('../server')>(), requireLessonManager: mocks.manager }));

const ids = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'];
const rows = ids.map((id, position) => ({ id, lesson_id: 'lesson', text: `Objective ${position}`, revision: 2, archived_at: null, visual_instructions: '' }));
const concept = 'Market day: learners balance loads on a trotro roof and compare forces.';

function harness() {
  const query = { select: () => query, eq: () => query, is: () => query, in: async () => ({ data: rows, error: null }) };
  mocks.manager.mockResolvedValue({ supabase: { from: () => query }, session: { user: { id: 'teacher' } }, lesson: { id: 'lesson', organization_id: 'org' } });
}
const call = async (objectives: unknown) => {
  const { POST } = await import('@/app/api/teachers/lessons/[lessonId]/prepare-objectives/route');
  return POST(new Request('http://localhost/api/test', { method: 'POST', body: JSON.stringify({ objectives }) }), { params: Promise.resolve({ lessonId: 'lesson' }) });
};

describe('prepare all objectives', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    harness();
    mocks.suggest.mockResolvedValue('An AI suggested concept with enough detail to use.');
    mocks.enqueue.mockResolvedValue({ batchId: 'batch', jobs: [], created: true });
  });

  it('keeps the teacher concept, suggests the missing one and queues both under one batch', async () => {
    const response = await call([{ id: ids[0], revision: 2, creativeConcept: concept }, { id: ids[1], revision: 2 }]);
    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body.prepared).toEqual(ids);
    expect(mocks.suggest).toHaveBeenCalledOnce();
    const batches = new Set(mocks.enqueue.mock.calls.map(([, input]) => input.batchId));
    expect(batches).toEqual(new Set([body.batchId]));
    expect(mocks.enqueue.mock.calls[0][1]).toMatchObject({ creativeConcept: concept });
    expect(mocks.after).toHaveBeenCalledOnce();
  });

  it('reports objectives that could not start without failing the rest', async () => {
    mocks.suggest.mockRejectedValueOnce({ message: 'AI_QUOTA_EXCEEDED' });
    const body = await (await call([{ id: ids[0], revision: 2, creativeConcept: concept }, { id: ids[1], revision: 2 }])).json();
    expect(body.prepared).toEqual([ids[0]]);
    expect(body.failed).toEqual([{ id: ids[1], error: 'Your school has reached its AI content limit' }]);
  });

  it('refuses stale revisions before any AI work', async () => {
    expect((await call([{ id: ids[0], revision: 1 }])).status).toBe(409);
    expect(mocks.suggest).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it('returns 429 when every objective hit the allowance', async () => {
    mocks.suggest.mockRejectedValue({ message: 'AI_QUOTA_EXCEEDED' });
    expect((await call([{ id: ids[1], revision: 2 }])).status).toBe(429);
  });
});
