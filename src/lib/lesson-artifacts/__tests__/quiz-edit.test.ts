import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { quizEditSchema, saveTeacherQuizEdit } from '../quiz-edit';

const quiz = {
  kind: 'structured_quiz' as const,
  title: 'Photosynthesis check',
  questions: [
    { id: 'q1', type: 'multiple_choice' as const, prompt: 'Which gas do plants take in?', options: ['Oxygen', 'Carbon dioxide'], correctAnswer: 'Carbon dioxide', explanation: 'Plants use CO2.', points: 1 },
    { id: 'q2', type: 'true_false' as const, prompt: 'Minerals are plant food.', correctAnswer: false, explanation: 'Glucose is the food.', points: 1 },
    { id: 'q3', type: 'numeric' as const, prompt: 'How many reactants?', correctAnswer: 3, tolerance: 0, explanation: 'CO2, water, light.', points: 1 },
  ],
};
const artifact = { id: 'quiz-v1', lesson_id: 'lesson', objective_id: 'objective', series_id: 'series', kind: 'structured_quiz', position: 3, generation_metadata: { materialRole: 'knowledge' } };

function harness({ objective = { revision: 4, archived_at: null } as Record<string, unknown> | null, insertErrors = [] as Array<{ code: string } | null> } = {}) {
  const inserts: Record<string, unknown>[] = [];
  let latestVersion = 2;
  const supabase = { from: (table: string) => {
    const chain: Record<string, unknown> = {
      select: () => chain, eq: () => chain, order: () => chain, limit: () => chain,
      maybeSingle: async () => table === 'lesson_objectives'
        ? { data: objective, error: null }
        : { data: { id: `quiz-v${latestVersion}`, version: latestVersion }, error: null },
      insert: (row: Record<string, unknown>) => {
        inserts.push(row);
        const error = insertErrors.shift() ?? null;
        if (error) latestVersion += 1;
        return { select: () => ({ single: async () => ({ data: error ? null : { id: 'new', ...row }, error }) }) };
      },
    };
    return chain;
  } };
  return { supabase: supabase as never, inserts };
}

describe('teacher quiz edits', () => {
  it('saves a new draft version authored by the teacher at the current revision', async () => {
    const { supabase, inserts } = harness();
    const created = await saveTeacherQuizEdit(supabase, { artifact, payload: quiz, userId: 'teacher' });
    expect(created).toMatchObject({ id: 'new', version: 3, status: 'draft', source: 'teacher_authored', objective_revision: 4, supersedes_id: 'quiz-v2', series_id: 'series' });
    expect(inserts[0]).toMatchObject({ validation_report: { status: 'passed', validator: 'schema' }, generation_metadata: { materialRole: 'knowledge', editedFrom: 'quiz-v1' } });
  });

  it('retries when another save takes the same version number', async () => {
    const { supabase, inserts } = harness({ insertErrors: [{ code: '23505' }] });
    await saveTeacherQuizEdit(supabase, { artifact, payload: quiz, userId: 'teacher' });
    expect(inserts.map(row => row.version)).toEqual([3, 4]);
  });

  it('rejects other materials and archived objectives', async () => {
    await expect(saveTeacherQuizEdit(harness().supabase, { artifact: { ...artifact, kind: 'visual_quiz' }, payload: quiz, userId: 'teacher' })).rejects.toMatchObject({ status: 400 });
    await expect(saveTeacherQuizEdit(harness({ objective: { revision: 4, archived_at: 'now' } }).supabase, { artifact, payload: quiz, userId: 'teacher' })).rejects.toMatchObject({ status: 409 });
  });

  it('refuses a correct answer that is not one of the options', () => {
    const broken = { ...quiz, questions: [{ ...quiz.questions[0], correctAnswer: 'Nitrogen' }, ...quiz.questions.slice(1)] };
    expect(quizEditSchema.safeParse({ payload: broken }).success).toBe(false);
    expect(quizEditSchema.safeParse({ payload: quiz }).success).toBe(true);
  });
});
