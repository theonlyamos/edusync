import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ manager: vi.fn(), supabase: vi.fn(), ai: vi.fn(), reserve: vi.fn(), after: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/ai', () => ({ generateAICompletion: mocks.ai }));
vi.mock('@/lib/supabase.server', () => ({ createServerSupabase: mocks.supabase }));
vi.mock('@/lib/lesson-artifacts/quota-server', () => ({ reserveOrganizationAiUsage: mocks.reserve }));
vi.mock('@/lib/lesson-artifacts/job-processor.server', () => ({ processContentJobBatch: vi.fn() }));
vi.mock('next/server', async (original) => ({ ...await original<typeof import('next/server')>(), after: mocks.after }));
vi.mock('@/lib/lesson-artifacts/server', async (original) => ({ ...await original<typeof import('../server')>(), requireLessonManager: mocks.manager }));

const concept = 'Rover rescue: learners explore force arrows and apply balanced forces to a new route.';
const objective = { id: 'objective', lesson_id: 'lesson', text: 'Explain forces.', revision: 2, archived_at: null, visual_instructions: 'Show force arrows.' };
const lesson = { id: 'lesson', title: 'Motion', subject: 'Science', gradelevel: '6', organization_id: 'org', visual_instructions: 'Use SI units.', current_publication_id: null };

function query(data: unknown) {
  const result = { data, error: null };
  const builder = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), is: vi.fn(), not: vi.fn(), order: vi.fn(), limit: vi.fn(), maybeSingle: vi.fn().mockResolvedValue(result), single: vi.fn().mockResolvedValue(result), then: Promise.resolve(result).then.bind(Promise.resolve(result)) };
  for (const method of ['select', 'eq', 'in', 'is', 'not', 'order', 'limit'] as const) builder[method].mockReturnValue(builder);
  return builder;
}

function harness(options: { currentRevision?: number; artifact?: unknown; jobs?: unknown[] | null; authoring?: boolean } = {}) {
  let objectiveReads = 0;
  let jobReads = 0;
  const active = query([{ batch_id: 'active-batch' }]);
  const conceptQueries: ReturnType<typeof query>[] = [];
  const rpc = vi.fn().mockResolvedValue({ error: null });
  const db = { rpc, from: vi.fn((table: string) => {
    if (table === 'lesson_objectives') return query(options.authoring ? [objective] : objectiveReads++ ? { ...objective, revision: options.currentRevision ?? 2 } : objective);
    if (table === 'lesson_artifacts') return query(options.authoring ? [] : options.artifact);
    if (table === 'content_jobs') {
      if (options.authoring && jobReads++ === 0) return active;
      const builder = query(options.jobs === undefined ? [] : options.jobs);
      conceptQueries.push(builder);
      return builder;
    }
    throw new Error(`Unexpected table ${table}`);
  }) };
  mocks.supabase.mockReturnValue(db);
  mocks.manager.mockResolvedValue({ supabase: db, session: { user: { id: 'teacher' } }, lesson });
  return { rpc, active, conceptQueries };
}

const request = (body: unknown) => new Request('http://localhost/api/test', { method: 'POST', body: JSON.stringify(body) });

describe('creative concept routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ai.mockResolvedValue(concept);
    mocks.reserve.mockResolvedValue(null);
  });

  it('authorizes and meters a text-only suggestion, returning the objective revision', async () => {
    const { rpc } = harness();
    const { POST } = await import('@/app/api/teachers/objectives/[objectiveId]/creative-concept/route');
    const response = await POST(request({ objectiveRevision: 2, guidance: 'Use a rover.' }), { params: Promise.resolve({ objectiveId: 'objective' }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ creativeConcept: concept, objectiveRevision: 2 });
    expect(mocks.manager).toHaveBeenCalledWith('lesson');
    expect(mocks.reserve).toHaveBeenCalledWith(expect.objectContaining({ userId: 'teacher', organizationId: 'org', category: 'interactive_generation', quantity: 1 }));
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects stale acceptance before consuming AI or enqueueing jobs', async () => {
    const { rpc } = harness();
    const suggestion = await import('@/app/api/teachers/objectives/[objectiveId]/creative-concept/route');
    const bundle = await import('@/app/api/teachers/objectives/[objectiveId]/generate-bundle/route');
    const params = { params: Promise.resolve({ objectiveId: 'objective' }) };
    expect((await suggestion.POST(request({ objectiveRevision: 1 }), params)).status).toBe(409);
    expect((await bundle.POST(request({ objectiveRevision: 1, creativeConcept: concept }), params)).status).toBe(409);
    expect(mocks.ai).not.toHaveBeenCalled();
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects a suggestion if its objective changed while AI was generating', async () => {
    harness({ currentRevision: 3 });
    const { POST } = await import('@/app/api/teachers/objectives/[objectiveId]/creative-concept/route');
    expect((await POST(request({ objectiveRevision: 2 }), { params: Promise.resolve({ objectiveId: 'objective' }) })).status).toBe(409);
    expect(mocks.ai).toHaveBeenCalledOnce();
  });

  it('rejects reused generation keys with a different concept instead of silently restoring old jobs', async () => {
    const { rpc } = harness({ jobs: [{ objective_id: 'objective', input: { objectiveRevision: 2, creativeConcept: 'A completely different earlier plan.' } }] });
    const { POST } = await import('@/app/api/teachers/objectives/[objectiveId]/generate-bundle/route');
    expect((await POST(request({ objectiveRevision: 2, creativeConcept: concept, idempotencyKey: 'same-request' }), { params: Promise.resolve({ objectiveId: 'objective' }) })).status).toBe(409);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('does not generate for unauthorized users or exhausted quotas', async () => {
    harness();
    const { LessonArtifactHttpError } = await import('../server');
    const { POST } = await import('@/app/api/teachers/objectives/[objectiveId]/creative-concept/route');
    mocks.manager.mockRejectedValueOnce(new LessonArtifactHttpError(403, 'Denied'));
    expect((await POST(request({ objectiveRevision: 2 }), { params: Promise.resolve({ objectiveId: 'objective' }) })).status).toBe(403);
    mocks.reserve.mockRejectedValueOnce({ message: 'AI_QUOTA_EXCEEDED' });
    expect((await POST(request({ objectiveRevision: 2 }), { params: Promise.resolve({ objectiveId: 'objective' }) })).status).toBe(429);
    expect(mocks.ai).not.toHaveBeenCalled();
  });

  it('snapshots the shared plan into all five bundle jobs and retains it for regeneration', async () => {
    const { rpc } = harness();
    const bundle = await import('@/app/api/teachers/objectives/[objectiveId]/generate-bundle/route');
    expect((await bundle.POST(request({ objectiveRevision: 2, creativeConcept: concept }), { params: Promise.resolve({ objectiveId: 'objective' }) })).status).toBe(202);
    const rows = rpc.mock.calls[0][1].p_rows;
    expect(rows).toHaveLength(5);
    for (const row of rows) expect(row.input).toMatchObject({ objectiveRevision: 2, creativeConcept: concept });

    const regenerated = harness({ artifact: { id: 'artifact', lesson_id: 'lesson', objective_id: 'objective', kind: 'interactive_visualization', position: 1, series_id: 'series', version: 1, generation_metadata: { creativeConcept: concept } }, jobs: null });
    const regenerate = await import('@/app/api/teachers/artifacts/[artifactId]/regenerate/route');
    expect((await regenerate.POST(request({ feedback: 'Larger labels.' }), { params: Promise.resolve({ artifactId: 'artifact' }) })).status).toBe(202);
    expect(regenerated.rpc.mock.calls[0][1].p_rows[0].input).toMatchObject({ creativeConcept: concept, feedback: 'Larger labels.', position: 1, materialRole: 'application' });
  });

  it('returns current accepted concepts and only the requester active batch on refresh', async () => {
    const { active, conceptQueries } = harness({ authoring: true, jobs: [{ objective_id: 'objective', input: { objectiveRevision: 2, creativeConcept: concept } }] });
    const { GET } = await import('@/app/api/teachers/lessons/[lessonId]/authoring/route');
    const response = await GET(new Request('http://localhost/api/test'), { params: Promise.resolve({ lessonId: 'lesson' }) });
    expect(await response.json()).toMatchObject({ viewerId: 'teacher', activeBatchId: 'active-batch', creativeConcepts: { objective: { revision: 2, concept } } });
    expect(active.eq).toHaveBeenCalledWith('requested_by', 'teacher');
    expect(active.in).toHaveBeenCalledWith('status', ['queued', 'running']);
    expect(conceptQueries).toHaveLength(1);
    expect(conceptQueries[0].eq).toHaveBeenCalledWith('objective_id', 'objective');
    expect(conceptQueries[0].eq).toHaveBeenCalledWith('input->>objectiveRevision', '2');
    expect(conceptQueries[0].limit).toHaveBeenCalledWith(1);
  });
});
