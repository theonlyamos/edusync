import { beforeEach, describe, expect, it, vi } from 'vitest';

const viewer = vi.fn();
const session = vi.fn();
const database = vi.fn();
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth', () => ({ getServerSession: session }));
vi.mock('@/lib/supabase.server', () => ({ createServerSupabase: database }));
vi.mock('../lesson-read-server', () => ({ requireLessonViewer: viewer }));

const image = {
  id: 'intro', lesson_id: 'lesson', objective_id: 'objective', objective_revision: 2,
  kind: 'generated_image', status: 'approved', payload: { kind: 'generated_image', introductionFor: 'objective', assetId: 'asset' },
};
function harness(rows: Record<string, unknown>) {
  const signed = vi.fn(async () => ({ data: { signedUrl: 'https://private.test/image' }, error: null }));
  const inserted = vi.fn(async () => ({ error: null }));
  const queries: Array<{ table: string; filters: unknown[] }> = [];
  const supabase = {
    from: vi.fn((table: string) => {
      const filters: unknown[] = [];
      queries.push({ table, filters });
      const result = { data: rows[table] ?? null, error: null };
      const chain: any = { then: (resolve: (value: unknown) => void) => resolve(result), insert: inserted };
      for (const method of ['select', 'eq', 'is', 'in', 'contains', 'order', 'limit']) chain[method] = (...args: unknown[]) => { filters.push([method, ...args]); return chain; };
      chain.single = chain.maybeSingle = async () => result;
      return chain;
    }),
    storage: { from: () => ({ createSignedUrl: signed }) },
  };
  database.mockReturnValue(supabase);
  return { supabase, signed, inserted, queries };
}

beforeEach(() => {
  vi.clearAllMocks();
  session.mockResolvedValue({ user: { id: 'student', role: 'student' } });
});

describe('introduction startup', () => {
  it('replays an approved publication introduction as a new tracked instance on every start', async () => {
    const { prepareObjectiveIntroduction } = await import('../introductions-server');
    const h = harness({ lesson_artifacts: image });
    const run = { id: 'run', lesson_id: 'lesson', student_id: 'student' };
    const objective = { id: 'objective', revision: 2, introductionArtifactId: 'intro', artifactIds: ['intro'] };
    const first = await prepareObjectiveIntroduction(h.supabase as never, run, objective);
    const second = await prepareObjectiveIntroduction(h.supabase as never, run, objective);
    expect(first?.artifact.id).toBe('intro');
    expect(first?.instanceId).not.toBe(second?.instanceId);
    expect(h.inserted).toHaveBeenCalledWith(expect.objectContaining({ event_type: 'artifact_resolved', artifact_id: 'intro', student_id: 'student' }));
    expect(h.queries[0].filters).toContainEqual(['eq', 'objective_revision', 2]);
  });
  it('does not fetch an unpublished introduction or manufacture one for a legacy publication', async () => {
    const { prepareObjectiveIntroduction } = await import('../introductions-server');
    const h = harness({});
    const run = { id: 'run', lesson_id: 'lesson', student_id: 'student' };
    expect(await prepareObjectiveIntroduction(h.supabase as never, run, { id: 'objective', revision: 1 })).toBeNull();
    await expect(prepareObjectiveIntroduction(h.supabase as never, run, { id: 'objective', revision: 1, introductionArtifactId: 'draft', artifactIds: [] })).rejects.toThrow('missing from this publication');
    expect(h.supabase.from).not.toHaveBeenCalled();
  });
});

describe('private lesson introduction assets', () => {
  it('allows the assigned current lesson introduction before a run exists', async () => {
    const h = harness({ lesson_assets: { id: 'asset', lesson_id: 'lesson', storage_bucket: 'lesson-assets', storage_path: 'image.png' }, learning_runs: [], lessons: { current_publication_id: 'publication' }, lesson_publications: { manifest: { lesson: { introductionArtifactId: 'intro' } } }, lesson_artifacts: { id: 'intro' } });
    viewer.mockResolvedValue({ supabase: h.supabase, session: { user: { role: 'student' } } });
    const { GET } = await import('@/app/api/lesson-assets/[assetId]/route');
    const response = await GET(new Request('https://test/api'), { params: Promise.resolve({ assetId: 'asset' }) });
    expect(response.status).toBe(200);
    expect(viewer).toHaveBeenCalledWith('lesson');
    expect(h.signed).toHaveBeenCalledOnce();
    expect(h.queries.find((query) => query.table === 'lesson_artifacts')?.filters).toContainEqual(['in', 'id', ['intro']]);
  });
  it('never signs an asset outside the published introduction or for an unauthorized viewer', async () => {
    const h = harness({ lesson_assets: { id: 'asset', lesson_id: 'lesson' }, learning_runs: [], lessons: { current_publication_id: 'publication' }, lesson_publications: { manifest: { lesson: { introductionArtifactId: 'intro' } } } });
    viewer.mockResolvedValue({ supabase: h.supabase });
    const { GET } = await import('@/app/api/lesson-assets/[assetId]/route');
    expect((await GET(new Request('https://test/api'), { params: Promise.resolve({ assetId: 'asset' }) })).status).toBe(403);
    const { LessonArtifactHttpError } = await import('../server');
    viewer.mockRejectedValue(new LessonArtifactHttpError(403, 'Wrong grade'));
    expect((await GET(new Request('https://test/api'), { params: Promise.resolve({ assetId: 'asset' }) })).status).toBe(403);
    expect(h.signed).not.toHaveBeenCalled();
  });
});
