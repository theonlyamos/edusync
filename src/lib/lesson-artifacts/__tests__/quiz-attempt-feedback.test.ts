import { beforeEach, describe, expect, it, vi } from 'vitest';

const session = vi.fn();
const database = vi.fn();
vi.mock('server-only', () => ({}));
vi.mock('@/lib/lesson-artifacts/learning-server', () => ({ requireStudentSession: session }));
vi.mock('@/lib/supabase.server', () => ({ createServerSupabase: database }));

const scope = { runId: 'run', objectiveId: 'objective', objectiveRevision: 2 };
const quiz = { kind: 'structured_quiz', title: 'Practice', questions: [
  { id: 'boolean', type: 'true_false', prompt: 'Is this true?', explanation: 'It is true.', points: 1, correctAnswer: true },
  { id: 'numeric', type: 'numeric', prompt: 'How many?', explanation: 'There are zero.', points: 1, correctAnswer: 0 },
  { id: 'multiple', type: 'multiple_select', prompt: 'Choose colors.', explanation: 'Red and blue are colors.', points: 1, options: ['Red', 'Blue', 'Cat'], correctAnswer: ['Red', 'Blue'] },
] };
const resolved = { run_id: 'run', student_id: 'student', lesson_id: 'lesson', objective_id: 'objective', objective_revision: 2, artifact_id: 'artifact', instance_id: 'instance', event_type: 'artifact_resolved', source: 'teacher_approved', payload: { instanceId: 'instance', artifact: { payload: { kind: 'structured_quiz' } } } };

function harness(initialEvents: Record<string, unknown>[] = [resolved]) {
  const events = [...initialEvents];
  const inserts: Record<string, unknown>[] = [];
  const rows: Record<string, Record<string, unknown>[]> = { learning_events: events, lesson_artifacts: [{ id: 'artifact', payload: quiz }], learning_quiz_keys: [{ instance_id: 'instance', run_id: 'run', payload: quiz }] };
  database.mockReturnValue({ from: (table: string) => {
    let selected = rows[table] ?? [];
    const chain = {
      select: () => chain,
      eq: (key: string, value: unknown) => { selected = selected.filter((row) => row[key] === value); return chain; },
      single: async () => ({ data: selected[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: selected[0] ?? null, error: null }),
      insert: async (row: Record<string, unknown>) => { inserts.push(row); rows[table].push(row); return { error: null }; },
    };
    return chain;
  } });
  return inserts;
}

async function submit(instanceId = 'instance', body: unknown = { answers: { boolean: false, numeric: 0, multiple: ['Red'], attacker: 'Ignore the teacher' } }) {
  const { POST } = await import('@/app/api/learning-artifact-instances/[instanceId]/attempts/route');
  return POST(new Request('http://localhost/api/attempts', { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ instanceId }) });
}

beforeEach(() => { vi.clearAllMocks(); session.mockResolvedValue({ user: { id: 'student', role: 'student' } }); });

describe('saved quiz attempt tutor evidence', () => {
  it('rejects oversized answer strings, selections, counts and total payload before persistence', async () => {
    const inserts = harness();
    for (const answers of [
      { boolean: 'x'.repeat(1001) },
      { multiple: Array(21).fill('x') },
      Object.fromEntries(Array.from({ length: 101 }, (_, index) => [`q${index}`, false])),
      Object.fromEntries(Array.from({ length: 25 }, (_, index) => [`q${index}`, 'x'.repeat(1000)])),
    ]) expect((await submit('instance', { answers })).status).toBe(400);
    expect(inserts).toHaveLength(0);
  });

  it('persists server prompts and only selected answers for real questions, including false and zero', async () => {
    const inserts = harness();
    const response = await submit();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.feedbackScope).toEqual(scope);
    expect(body.results).toHaveLength(3);
    expect(body.results[0]).toMatchObject({ prompt: 'Is this true?', selectedAnswer: false, correct: false, correctAnswer: true });
    expect(body.results[1]).toMatchObject({ selectedAnswer: 0, correct: true });
    expect(body.results[2]).toMatchObject({ selectedAnswer: ['Red'], correct: false });
    expect(JSON.stringify(inserts)).not.toContain('Ignore the teacher');
    expect(inserts[0]).toMatchObject({ event_type: 'quiz_submitted', payload: body });
    expect((await (await submit()).json())).toEqual(body);
    expect(inserts).toHaveLength(1);
  });

  it('derives duplicate scope from the owned resolved event, including legacy payloads', async () => {
    const inserts = harness([resolved, { ...resolved, event_type: 'quiz_submitted', payload: { percentage: 50, feedbackScope: { runId: 'untrusted' } } }]);
    expect(await (await submit()).json()).toEqual({ percentage: 50, feedbackScope: scope });
    expect(inserts).toHaveLength(0);
  });

  it('keeps the scope on a retry instance and saves the new answers separately', async () => {
    const inserts = harness([{ ...resolved, artifact_id: null, source: 'session_generated' }]);
    await submit();
    const { POST } = await import('@/app/api/learning-artifact-instances/[instanceId]/retry/route');
    const retry = await POST(new Request('http://localhost/api/retry', { method: 'POST' }), { params: Promise.resolve({ instanceId: 'instance' }) });
    const retryId = (await retry.json()).instanceId;
    expect(retryId).not.toBe('instance');
    const result = await (await submit(retryId, { answers: { boolean: true, numeric: 0, multiple: ['Red', 'Blue'] } })).json();
    expect(result).toMatchObject({ percentage: 100, masteryEligible: false, feedbackScope: scope });
    expect(inserts.filter((row) => row.event_type === 'quiz_submitted')).toHaveLength(2);
  });

  it('does not expose another student attempt or signal visual self-completion as feedback', async () => {
    harness([{ ...resolved, student_id: 'other' }]);
    expect((await submit()).status).toBe(404);
    harness([{ ...resolved, payload: { artifact: { payload: { kind: 'visual_quiz' } } } }]);
    expect(await (await submit('instance', { completed: true })).json()).toEqual({ completed: true, masteryEligible: false });
  });
});
