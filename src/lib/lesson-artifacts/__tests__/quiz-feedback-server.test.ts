import { beforeEach, describe, expect, it, vi } from 'vitest';

const session = vi.fn();
const database = vi.fn();
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth', () => ({ getServerSession: session }));
vi.mock('@/lib/supabase.server', () => ({ createServerSupabase: database }));
vi.mock('@/lib/ai', () => ({ generateAICompletion: vi.fn() }));
vi.mock('@/lib/visualize-ai-task', () => ({ runVisualizeGeneration: vi.fn() }));
vi.mock('../media-provider', () => ({ embedGroundingText: vi.fn() }));

const run = { id: 'run', student_id: 'student', lesson_id: 'lesson', publication_id: 'publication', active_objective_id: 'objective' };
const submission = { id: 'event', run_id: 'run', student_id: 'student', lesson_id: 'lesson', objective_id: 'objective', objective_revision: 2, event_type: 'quiz_submitted', source: 'teacher_approved', payload: { percentage: 70 } };

function harness(overrides: Record<string, Record<string, unknown>[]> = {}) {
  const rows: Record<string, Record<string, unknown>[]> = {
    learning_runs: [run],
    lesson_publications: [{ id: 'publication', lesson_id: 'lesson', manifest: { objectives: [{ id: 'objective', revision: 2 }] } }],
    learning_events: [submission, { ...submission, id: 'stale', objective_revision: 1 }, { ...submission, id: 'visual', event_type: 'visual_quiz_completed' }, { ...submission, id: 'other-student', student_id: 'other' }, { ...submission, id: 'other-run', run_id: 'other' }],
    ...overrides,
  };
  const queries: unknown[][] = [];
  const supabase = { from: (table: string) => {
    let selected = rows[table] ?? [];
    const result = () => ({ data: selected, error: null });
    const chain = {
      select: () => chain,
      eq: (key: string, value: unknown) => { queries.push([table, key, value]); selected = selected.filter((row) => row[key] === value); return chain; },
      order: () => chain,
      limit: (count: number) => { queries.push([table, 'limit', count]); selected = selected.slice(0, count); return chain; },
      single: async () => ({ data: selected[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: selected[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
    };
    return chain;
  } };
  database.mockReturnValue(supabase);
  return queries;
}

beforeEach(() => { vi.clearAllMocks(); session.mockResolvedValue({ user: { id: 'student', role: 'student' } }); });

describe('quiz feedback access and scope', () => {
  it('filters student, run, pinned objective revision and structured events; limits to three', async () => {
    const queries = harness();
    const { getQuizTutorFeedback } = await import('../quiz-feedback-server');
    const snapshot = await getQuizTutorFeedback('run', 'lesson');
    expect(snapshot.eventIds).toEqual(['event']);
    expect(snapshot.objectiveRevision).toBe(2);
    expect(queries).toContainEqual(['learning_runs', 'student_id', 'student']);
    expect(queries).toContainEqual(['learning_events', 'limit', 3]);
    expect(queries).toContainEqual(['lesson_publications', 'id', 'publication']);
  });

  it('returns no evidence for an empty current revision', async () => {
    harness({ learning_events: [{ ...submission, objective_revision: 1 }] });
    const { getQuizTutorFeedback } = await import('../quiz-feedback-server');
    const snapshot = await getQuizTutorFeedback('run');
    expect(snapshot.eventIds).toEqual([]);
    expect(snapshot.context).toContain('No recorded quiz results for this objective');
    expect(snapshot.context).toContain('"objectiveRevision":2');
  });

  it('rejects missing sessions, other owners, lesson mismatch and inactive objectives', async () => {
    const { getQuizTutorFeedback } = await import('../quiz-feedback-server');
    harness();
    session.mockResolvedValueOnce(null);
    await expect(getQuizTutorFeedback('run')).rejects.toMatchObject({ status: 401 });
    harness({ learning_runs: [{ ...run, student_id: 'other' }] });
    await expect(getQuizTutorFeedback('run')).rejects.toMatchObject({ status: 404 });
    harness();
    await expect(getQuizTutorFeedback('run', 'other-lesson')).rejects.toMatchObject({ status: 403 });
    harness({ learning_runs: [{ ...run, active_objective_id: 'removed' }] });
    await expect(getQuizTutorFeedback('run')).rejects.toMatchObject({ status: 409 });
  });

  it('exposes the authorized snapshot through an uncached route and preserves access errors', async () => {
    harness();
    const { GET } = await import('@/app/api/learning-runs/[runId]/quiz-feedback/route');
    const request = new Request('http://localhost/api/learning-runs/run/quiz-feedback');
    const response = await GET(request, { params: Promise.resolve({ runId: 'run' }) });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect((await response.json()).eventIds).toEqual(['event']);
    session.mockResolvedValueOnce(null);
    expect((await GET(request, { params: Promise.resolve({ runId: 'run' }) })).status).toBe(401);
  });
});
