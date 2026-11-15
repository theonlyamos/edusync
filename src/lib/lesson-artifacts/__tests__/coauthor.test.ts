import { describe, expect, it } from 'vitest';

import { buildCoauthorContext, coauthorRequestSchema, parseCoauthorReply, validateProposals, type CoauthorLessonState } from '../coauthor';

const O1 = '11111111-1111-4111-8111-111111111111';
const O2 = '22222222-2222-4222-8222-222222222222';
const QUIZ = '33333333-3333-4333-8333-333333333333';
const VISUAL = '44444444-4444-4444-8444-444444444444';
const OLD_VISUAL = '55555555-5555-4555-8555-555555555555';
const UPLOAD = '66666666-6666-4666-8666-666666666666';

const question = (id: string) => ({ id, type: 'multiple_choice', prompt: `Question ${id}?`, options: ['Air', 'Soil'], correctAnswer: 'Air', explanation: 'Carbon comes from the air.', points: 1 });
const quizPayload = { kind: 'structured_quiz' as const, title: 'Check', questions: [question('q1'), question('q2'), question('q3')] };
const artifact = (id: string, objectiveId: string | null, kind: string, payload: unknown, extra: Record<string, unknown> = {}) => ({
  id, objective_id: objectiveId, objective_revision: 2, series_id: `series-${id}`, version: 1, kind, status: 'draft', position: 0, payload, ...extra,
}) as never;

const state: CoauthorLessonState = {
  lesson: { title: 'Photosynthesis', subject: 'Science', gradeLevel: '7', content: 'Plants make food.', visualInstructions: 'A school garden.' },
  objectives: [
    { id: O1, text: 'Explain where plant mass comes from.', position: 0, revision: 2, visualInstructions: '' },
    { id: O2, text: 'Predict how light changes the rate.', position: 1, revision: 1, visualInstructions: 'Use a lamp.' },
  ],
  artifacts: [
    artifact(QUIZ, O1, 'structured_quiz', quizPayload),
    artifact(VISUAL, O1, 'interactive_visualization', { kind: 'interactive_visualization', library: 'react', code: 'x', explanation: 'e', taskDescription: 'Weigh a tree.' }, { generation_metadata: { materialRole: 'exploration' } }),
    artifact(OLD_VISUAL, O1, 'interactive_visualization', { kind: 'interactive_visualization', library: 'react', code: 'x', explanation: 'e', taskDescription: 'Old.' }, { objective_revision: 1, generation_metadata: { materialRole: 'application' } }),
    artifact(UPLOAD, O1, 'uploaded_media', { kind: 'uploaded_media', assetId: '77777777-7777-4777-8777-777777777777', title: 'Notes', mimeType: 'text/plain', originalFilename: 'notes.txt' }),
  ],
  concepts: { [O1]: { revision: 2, concept: 'Tree rescue: weigh what a tree is made of.' } },
};

const concept = 'Concept: Bake sale\n\nIntroduction: a tray bake\n\nExplore: cut the tray\n\nApply: share it out\n\nKnowledge check: compare cuts\n\nVisual challenge: order the slices';

describe('lesson co-author', () => {
  it('describes the lesson, current materials and what the teacher is looking at', () => {
    const context = buildCoauthorContext(state, { step: 'objective', objectiveId: O1, materialKey: 'knowledge', artifactId: QUIZ });
    expect(context).toContain(`1. [${O1}] Explain where plant mass comes from.`);
    expect(context).toContain(`Knowledge check: [${QUIZ}] draft, quiz "Check"`);
    expect(context).toContain('Tree rescue');
    expect(context).toContain('Apply: not generated for the current directions');
    expect(context).not.toContain(OLD_VISUAL);
    expect(context).toContain('The teacher is looking at objective 1, the knowledge step');
  });

  it('prefers the unsaved concept on screen', () => {
    expect(buildCoauthorContext(state, { step: 'objective', objectiveId: O1, materialKey: 'concept', conceptDraft: 'A new orchard idea for the class.' }))
      .toContain('A new orchard idea for the class. (unsaved draft on screen)');
  });

  it('only accepts requests that end with the teacher', () => {
    expect(coauthorRequestSchema.safeParse({ messages: [{ role: 'teacher', text: 'Hi' }] }).success).toBe(true);
    expect(coauthorRequestSchema.safeParse({ messages: [{ role: 'teacher', text: 'Hi' }, { role: 'coauthor', text: 'Hello' }] }).success).toBe(false);
  });

  it('keeps proposals that point at this lesson and drops the rest', () => {
    const proposals = validateProposals([
      { type: 'objectives', summary: 'Reword', objectives: [{ id: O1, text: 'New wording' }, { id: 'made-up', text: 'Brand new' }, { id: O1, text: 'Duplicate id' }] },
      { type: 'concept', summary: 'Concept', objectiveId: O2, concept },
      { type: 'concept', summary: 'Too short', objectiveId: O2, concept: 'short' },
      { type: 'regenerate', summary: 'Remake', artifactId: VISUAL, feedback: 'Bigger labels' },
      { type: 'regenerate', summary: 'Old', artifactId: OLD_VISUAL, feedback: 'x' },
      { type: 'regenerate', summary: 'Upload', artifactId: UPLOAD, feedback: 'x' },
      { type: 'quiz', summary: 'Fix', artifactId: QUIZ, questions: [question('q1'), question('q2'), question('q9')] },
    ], state);
    expect(proposals.map((proposal) => proposal.summary)).toEqual(['Reword', 'Concept', 'Remake', 'Fix']);
    expect(proposals[0]).toMatchObject({ objectives: [{ id: O1, text: 'New wording' }, { text: 'Brand new' }, { text: 'Duplicate id' }] });
    expect(proposals[0].type === 'objectives' && proposals[0].objectives[1]).not.toHaveProperty('id');
    expect(proposals[1]).toMatchObject({ objectiveRevision: 1 });
    expect(proposals[2]).toMatchObject({ objectiveId: O1, materialKey: 'exploration' });
    expect(proposals[3]).toMatchObject({ materialKey: 'knowledge', payload: { kind: 'structured_quiz', title: 'Check' } });
  });

  it('rejects invalid quizzes and caps the number of proposals', () => {
    expect(validateProposals([{ type: 'quiz', summary: 'Two only', artifactId: QUIZ, questions: [question('a'), question('b')] }], state)).toEqual([]);
    expect(validateProposals([{ type: 'quiz', summary: 'Not a quiz', artifactId: VISUAL, questions: [question('a'), question('b'), question('c')] }], state)).toEqual([]);
    const many = Array.from({ length: 6 }, (_, index) => ({ type: 'lesson_direction', summary: `D${index}`, visualInstructions: 'x' }));
    expect(validateProposals(many, state)).toHaveLength(4);
  });

  it('accepts generation proposals for real objectives', () => {
    const proposals = validateProposals([
      { type: 'generate_introduction', summary: 'Intro' },
      { type: 'generate_materials', summary: 'Make O2', objectiveId: O2, concept },
      { type: 'generate_materials', summary: 'Make O1', objectiveId: O1, concept: null },
      { type: 'generate_materials', summary: 'Ghost', objectiveId: 'nope', concept: null },
      { type: 'prepare_all', summary: 'All' },
    ], state);
    expect(proposals.map((proposal) => proposal.summary)).toEqual(['Intro', 'Make O2', 'Make O1', 'All']);
    expect(proposals[1]).toMatchObject({ objectiveRevision: 1, concept });
    expect(proposals[2]).not.toHaveProperty('concept');
  });

  it('only offers a lesson text rewrite when it saw the whole text', () => {
    const rewrite = { type: 'content', summary: 'Rewrite', content: '# New text' };
    expect(validateProposals([rewrite], state)).toHaveLength(1);
    const long = { ...state, lesson: { ...state.lesson, content: 'x'.repeat(20_000) } };
    expect(validateProposals([rewrite], long)).toEqual([]);
    expect(buildCoauthorContext(long, { step: 'lesson' })).toContain('do not propose a "content" rewrite');
  });

  it('reads JSON replies, and plain text as a reply without proposals', () => {
    expect(parseCoauthorReply('```json\n{"reply":"Sure.","proposals":[{"type":"prepare_all","summary":"All"}]}\n```', state))
      .toEqual({ reply: 'Sure.', proposals: [{ type: 'prepare_all', summary: 'All' }] });
    expect(parseCoauthorReply('Who is the class?', state)).toEqual({ reply: 'Who is the class?', proposals: [] });
    expect(() => parseCoauthorReply('{"reply": ', state)).toThrow();
    expect(() => parseCoauthorReply('', state)).toThrow();
  });
});

describe('co-author sketches', () => {
  it('accepts a sketch for a real objective with a usable description', () => {
    const proposals = validateProposals([
      { type: 'sketch', summary: 'Tree scale', objectiveId: O1, role: 'exploration', taskDescription: 'Students drag air, water and soil blocks onto a tree.' },
      { type: 'sketch', summary: 'Too short', objectiveId: O1, role: 'exploration', taskDescription: 'tree' },
      { type: 'sketch', summary: 'Bad role', objectiveId: O1, role: 'intro', taskDescription: 'Students drag air, water and soil blocks.' },
    ], state);
    expect(proposals).toEqual([{ type: 'sketch', summary: 'Tree scale', objectiveId: O1, role: 'exploration', taskDescription: 'Students drag air, water and soil blocks onto a tree.' }]);
  });
});
