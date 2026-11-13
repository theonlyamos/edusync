import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ manager: vi.fn(), supabase: vi.fn(), reserve: vi.fn(), visualize: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase.server', () => ({ createServerSupabase: mocks.supabase }));
vi.mock('@/lib/lesson-artifacts/quota-server', () => ({ reserveOrganizationAiUsage: mocks.reserve }));
vi.mock('@/lib/visualize-ai-task', () => ({ runVisualizeGeneration: mocks.visualize }));
vi.mock('@/lib/lesson-artifacts/server', async (original) => ({ ...await original<typeof import('../server')>(), requireLessonManager: mocks.manager }));

import { describePoint, describePointForTeacher, regionName } from '../point-comment';
import { signSketch, verifySketch } from '../sketch.server';

const OBJECTIVE = '11111111-1111-4111-8111-111111111111';
const objective = { id: OBJECTIVE, lesson_id: 'lesson', text: 'Explain forces.', revision: 3, archived_at: null };
const lesson = { id: 'lesson', title: 'Motion', organization_id: 'org' };

function query(data: unknown) {
  const result = { data, error: null };
  const builder: Record<string, unknown> = { maybeSingle: vi.fn().mockResolvedValue(result), single: vi.fn().mockResolvedValue({ data: { id: 'artifact', series_id: 'series' }, error: null }) };
  for (const method of ['select', 'eq', 'insert']) builder[method] = vi.fn(() => builder);
  return builder;
}

function harness() {
  const artifacts = query(null);
  const db = { from: vi.fn((table: string) => table === 'lesson_objectives' ? query(objective) : artifacts) };
  mocks.supabase.mockReturnValue(db);
  mocks.manager.mockResolvedValue({ supabase: db, session: { user: { id: 'teacher' } }, lesson });
  return { artifacts };
}

const post = (body: unknown) => new Request('http://localhost/api/test', { method: 'POST', body: JSON.stringify(body) });
const task = 'Drag weights onto a cart and watch it speed up.';

describe('live sketches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-secret';
    mocks.reserve.mockResolvedValue(null);
    mocks.visualize.mockResolvedValue({ code: 'export default () => null', library: 'react', explanation: 'A cart.' });
  });

  it('signs exactly what was drawn', () => {
    const input = { lessonId: 'lesson', objectiveId: OBJECTIVE, objectiveRevision: 3, role: 'exploration' as const, taskDescription: task, library: 'react', code: 'x', explanation: 'y' };
    const signature = signSketch(input);
    expect(verifySketch(input, signature)).toBe(true);
    expect(verifySketch({ ...input, code: 'alert(1)' }, signature)).toBe(false);
    expect(verifySketch({ ...input, lessonId: 'other' }, signature)).toBe(false);
  });

  it('draws a sketch with the role, meters one visual, and keeps only a signed one', async () => {
    const { artifacts } = harness();
    const { POST: draw } = await import('@/app/api/teachers/lessons/[lessonId]/sketch/route');
    const drawn = await draw(post({ objectiveId: OBJECTIVE, role: 'exploration', taskDescription: task }), { params: Promise.resolve({ lessonId: 'lesson' }) });
    expect(drawn.status).toBe(200);
    const sketch = await drawn.json();
    expect(sketch).toMatchObject({ objectiveId: OBJECTIVE, objectiveRevision: 3, role: 'exploration', library: 'react' });
    expect(mocks.reserve).toHaveBeenCalledWith(expect.objectContaining({ category: 'interactive_generation', quantity: 1, organizationId: 'org' }));
    expect(mocks.visualize.mock.calls[0][0].task_description).toContain('Exploration:');
    expect(mocks.visualize.mock.calls[0][0].task_description).toContain(task);

    const { POST: keep } = await import('@/app/api/teachers/objectives/[objectiveId]/keep-sketch/route');
    const tampered = await keep(post({ ...sketch, code: 'alert(1)' }), { params: Promise.resolve({ objectiveId: OBJECTIVE }) });
    expect(tampered.status).toBe(400);
    expect(artifacts.insert).not.toHaveBeenCalled();

    const kept = await keep(post(sketch), { params: Promise.resolve({ objectiveId: OBJECTIVE }) });
    expect(kept.status).toBe(200);
    expect((await kept.json()).materialKey).toBe('exploration');
    expect(artifacts.insert).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'interactive_visualization', status: 'draft', position: 1, objective_revision: 3,
      validation_report: { status: 'pending', validator: 'sandbox-runtime' },
      generation_metadata: expect.objectContaining({ materialRole: 'exploration', fromSketch: true }),
    }));
  });

  it('refuses to keep a sketch drawn for an earlier version of the objective', async () => {
    harness();
    const old = { objectiveRevision: 2, role: 'visualChallenge' as const, taskDescription: task, library: 'react' as const, code: 'x', explanation: 'y' };
    const signature = signSketch({ lessonId: 'lesson', objectiveId: OBJECTIVE, ...old });
    const { POST: keep } = await import('@/app/api/teachers/objectives/[objectiveId]/keep-sketch/route');
    const response = await keep(post({ ...old, signature }), { params: Promise.resolve({ objectiveId: OBJECTIVE }) });
    expect(response.status).toBe(409);
  });
});

describe('point and comment', () => {
  it('names the region and position of a pin', () => {
    expect(regionName(0.1, 0.1)).toBe('top left');
    expect(regionName(0.5, 0.5)).toBe('centre');
    expect(regionName(0.9, 0.5)).toBe('middle right');
    expect(describePoint({ artifactId: 'a1', x: 0.25, y: 0.8, comment: ' Bigger label ' }, 'Explore, objective 2'))
      .toBe('On the Explore, objective 2 [a1], I pointed at the bottom left of the preview (25% from the left, 80% from the top): Bigger label');
  });

  it('shows the teacher a short version without ids', () => {
    const text = describePointForTeacher({ artifactId: 'a1', x: 0.9, y: 0.1, comment: 'Bigger label' }, 'Explore, objective 2');
    expect(text).toBe('Pinned on the Explore, objective 2, top right: Bigger label');
    expect(text).not.toContain('a1');
  });
});
