import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireStudentSessionMock = vi.fn();
const createServerSupabaseMock = vi.fn();

vi.mock('server-only', () => ({}));
vi.mock('@/lib/lesson-artifacts/learning-server', () => ({
  requireStudentSession: requireStudentSessionMock,
}));
vi.mock('@/lib/supabase.server', () => ({
  createServerSupabase: createServerSupabaseMock,
}));

const lessonId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const objective1 = '11111111-1111-4111-8111-111111111111';
const objective2 = '22222222-2222-4222-8222-222222222222';

function terminal(result: { data: unknown; error: unknown }, method: 'single' | 'maybeSingle') {
  return { [method]: vi.fn().mockResolvedValue(result) };
}

function createHarness(
  existingRun: Record<string, unknown> | null = null,
  options: { eventError?: Error } = {},
) {
  const insertedRun = {
    id: 'run-new',
    active_objective_id: objective1,
    student_id: 'student-1',
    lesson_id: lessonId,
  };
  const insertRun = vi.fn(() => ({
    select: vi.fn(() => terminal({ data: insertedRun, error: null }, 'single')),
  }));
  const updateRun = vi.fn((values: Record<string, unknown>) => ({
    eq: vi.fn(() => ({
      eq: vi.fn(() => ({
        select: vi.fn(() => terminal({ data: { ...(existingRun ?? {}), ...values }, error: null }, 'single')),
      })),
    })),
  }));
  const insertEvent = vi.fn().mockResolvedValue({ data: null, error: options.eventError ?? null });

  const from = vi.fn((table: string) => {
    if (table === 'lessons') {
      return { select: vi.fn(() => ({ eq: vi.fn(() => terminal({ data: {
        id: lessonId,
        title: 'Forces',
        subject: 'Physics',
        gradelevel: 'JHS 1',
        current_publication_id: 'publication-1',
      }, error: null }, 'maybeSingle')) })) };
    }
    if (table === 'students') {
      return { select: vi.fn(() => ({ eq: vi.fn(() => terminal({ data: { grade: 'jhs 1' }, error: null }, 'maybeSingle')) })) };
    }
    if (table === 'lesson_publications') {
      return { select: vi.fn(() => ({ eq: vi.fn(() => terminal({ data: {
        id: 'publication-1',
        version: 3,
        manifest: { objectives: [
          { id: objective1, text: 'Define force.', position: 0, revision: 1 },
          { id: objective2, text: 'Calculate force.', position: 1, revision: 2 },
        ] },
      }, error: null }, 'single')) })) };
    }
    if (table === 'learning_runs') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    order: vi.fn(() => ({
                      limit: vi.fn(() => terminal({ data: existingRun, error: null }, 'maybeSingle')),
                    })),
                  })),
                })),
              })),
            })),
          })),
        })),
        insert: insertRun,
        update: updateRun,
      };
    }
    if (table === 'learning_events') return { insert: insertEvent };
    throw new Error(`Unexpected table ${table}`);
  });

  createServerSupabaseMock.mockReturnValue({ from });
  return { insertRun, updateRun, insertEvent };
}

async function callPost(body: unknown) {
  const { POST } = await import('@/app/api/learning-runs/route');
  const response = await POST(new Request('http://localhost/api/learning-runs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }));
  return { response, json: await response.json() };
}

describe('learning run objective selection', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    requireStudentSessionMock.mockResolvedValue({ user: { id: 'student-1', role: 'student' } });
  });

  it('creates a run on the requested publication objective', async () => {
    const harness = createHarness();

    const { response } = await callPost({ lessonId, mode: 'tutor', objectiveId: objective1 });

    expect(response.status).toBe(200);
    expect(harness.insertRun).toHaveBeenCalledWith(expect.objectContaining({ active_objective_id: objective1 }));
    expect(harness.insertEvent).not.toHaveBeenCalled();
  });

  it('switches a resumed run and records one objective_changed event', async () => {
    const existingRun = { id: 'run-1', active_objective_id: objective1, student_id: 'student-1', lesson_id: lessonId };
    const harness = createHarness(existingRun);

    const { response } = await callPost({ lessonId, mode: 'tutor', objectiveId: objective2 });

    expect(response.status).toBe(200);
    expect(harness.updateRun).toHaveBeenCalledWith(expect.objectContaining({ active_objective_id: objective2 }));
    expect(harness.insertEvent).toHaveBeenCalledOnce();
    expect(harness.insertEvent).toHaveBeenCalledWith(expect.objectContaining({
      event_type: 'objective_changed',
      objective_id: objective2,
      objective_revision: 2,
    }));
  });

  it('rejects a stale objective without creating or updating a run', async () => {
    const harness = createHarness();
    const staleObjective = '33333333-3333-4333-8333-333333333333';

    const { response } = await callPost({ lessonId, mode: 'tutor', objectiveId: staleObjective });

    expect(response.status).toBe(400);
    expect(harness.insertRun).not.toHaveBeenCalled();
    expect(harness.updateRun).not.toHaveBeenCalled();
  });

  it('restores the previous objective if objective_changed recording fails', async () => {
    const existingRun = { id: 'run-1', active_objective_id: objective1, student_id: 'student-1', lesson_id: lessonId };
    const harness = createHarness(existingRun, { eventError: new Error('event insert failed') });

    const { response } = await callPost({ lessonId, mode: 'tutor', objectiveId: objective2 });

    expect(response.status).toBe(500);
    expect(harness.updateRun).toHaveBeenCalledTimes(2);
    expect(harness.updateRun).toHaveBeenNthCalledWith(2, expect.objectContaining({ active_objective_id: objective1 }));
  });
});
