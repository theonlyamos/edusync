import { describe, expect, it } from 'vitest';
import { directionEditImpact, getStudioMaterials, nextReviewStep, unpreparedObjectives, type StudioArtifact, audienceSummary } from '../studio-state';

function artifact(overrides: Partial<StudioArtifact> = {}): StudioArtifact {
  return { id: 'intro', objective_id: 'objective', objective_revision: 2, series_id: 'intro', version: 1, position: 0,
    kind: 'generated_image', status: 'approved', created_at: '2026-09-11T00:00:00Z',
    payload: { kind: 'generated_image', introductionFor: 'objective', assetId: 'asset', altText: 'Diagram', caption: 'Caption', aspectRatio: '4:3' }, ...overrides };
}

describe('focused Studio materials', () => {
  it('keeps all five review steps before any generation', () => {
    expect(getStudioMaterials([], 'objective', 2).map(item => item.key)).toEqual(['introduction', 'exploration', 'application', 'knowledge', 'challenge']);
  });
  it('shows the latest version but retains approval of a current previous version', () => {
    const steps = getStudioMaterials([artifact(), artifact({ id: 'replacement', version: 2, status: 'draft' })], 'objective', 2);
    expect(steps[0].artifacts.map(item => item.id)).toEqual(['replacement']);
    expect(steps[0].approved).toBe(true);
    expect(getStudioMaterials([artifact()], 'objective', 3)[0].approved).toBe(false);
  });
  it('separates repeated bundles by role without losing earlier series or teacher media', () => {
    const interactive = (id: string, position: number) => artifact({ id, series_id: id, position, generation_metadata: { materialRole: position === 1 ? 'exploration' : 'application' }, kind: 'interactive_visualization', payload: { kind: 'interactive_visualization', library: 'react', code: 'function App(){}', explanation: 'Explore', taskDescription: 'Explore' } });
    const steps = getStudioMaterials([artifact(), interactive('explore', 1), interactive('apply', 2), interactive('explore-again', 1),
      artifact({ id: 'other-objective', objective_id: 'other' }),
      artifact({ id: 'upload', series_id: 'upload', kind: 'uploaded_media', payload: { kind: 'uploaded_media', assetId: 'asset', title: 'Notes', mimeType: 'text/plain', originalFilename: 'notes.txt' } }),
    ], 'objective', 2);
    expect(steps[1].artifacts).toHaveLength(2);
    expect(steps[2].artifacts.map(item => item.id)).toEqual(['apply']);
    expect(steps.at(-1)?.key).toBe('media');
    expect(steps[0].artifacts).toHaveLength(1);
    expect(getStudioMaterials([interactive('application-first', 2)], 'objective', 2)[2].artifacts).toHaveLength(1);
    const mixed = getStudioMaterials([interactive('new-explore', 1), interactive('new-apply', 2),
      { ...interactive('old-explore', 0), generation_metadata: null },
      { ...interactive('old-apply', 1), generation_metadata: null },
    ], 'objective', 2);
    expect(mixed[1].artifacts.map(item => item.id)).toEqual(['new-explore', 'old-explore']);
    expect(mixed[2].artifacts.map(item => item.id)).toEqual(['new-apply', 'old-apply']);
  });
  it('does not treat legacy illustrations as approved introductions', () => {
    const old = artifact();
    if (old.payload.kind === 'generated_image') delete old.payload.introductionFor;
    const step = getStudioMaterials([old], 'objective', 2)[0];
    expect(step.artifacts).toHaveLength(1);
    expect(step.approved).toBe(false);
  });
});

describe('direction edit impact', () => {
  const objectives = [
    { id: 'a', text: 'Name the reactants', position: 0, revision: 2, visualInstructions: '' },
    { id: 'b', text: 'Explain soil minerals', position: 1, revision: 1, visualInstructions: 'Use a farm' },
  ];
  const lessonIntro = artifact({ id: 'lesson-intro', series_id: 'lesson-intro', objective_id: null, objective_revision: 4,
    payload: { kind: 'generated_image', introductionFor: 'lesson', assetId: 'asset', altText: 'Overview', caption: 'Caption', aspectRatio: '4:3' } });
  const quiz = (id: string, objective: string, revision: number) => artifact({ id, series_id: id, objective_id: objective, objective_revision: revision, kind: 'structured_quiz',
    payload: { kind: 'structured_quiz', title: 'Check', questions: [] } as unknown as StudioArtifact['payload'] });
  const saved = { lessonInstructions: 'Ghana farms', lessonRevision: 4, objectives, artifacts: [lessonIntro, artifact({ objective_id: 'a' }), quiz('qa', 'a', 2), quiz('qb', 'b', 1)] };
  const same = { lessonInstructions: 'Ghana farms', objectives: objectives.map(({ id, text, visualInstructions }) => ({ id, text, visualInstructions })) };

  it('reports nothing when only whitespace changes', () => {
    expect(directionEditImpact(saved, { ...same, lessonInstructions: ' Ghana farms ' }).total).toBe(0);
  });
  it('outdates every objective and the lesson introduction when lesson directions change', () => {
    const impact = directionEditImpact(saved, { ...same, lessonInstructions: 'Kumasi market' });
    expect(impact.lessonIntroduction).toBe(true);
    expect(impact.objectives.map(item => [item.id, item.approved])).toEqual([['a', 2], ['b', 1]]);
    expect(impact.total).toBe(4);
  });
  it('limits an objective edit to that objective and the lesson introduction', () => {
    const impact = directionEditImpact(saved, { ...same, objectives: same.objectives.map(item => item.id === 'b' ? { ...item, text: 'Explain minerals' } : item) });
    expect(impact.objectives.map(item => item.id)).toEqual(['b']);
    expect(impact.lessonIntroduction).toBe(true);
    expect(impact.total).toBe(2);
  });
  it('changing objective directions keeps the lesson introduction', () => {
    const impact = directionEditImpact(saved, { ...same, objectives: same.objectives.map(item => item.id === 'a' ? { ...item, visualInstructions: 'Show a leaf' } : item) });
    expect(impact.lessonIntroduction).toBe(false);
    expect(impact.total).toBe(2);
  });
  it('counts removed objectives and reorders', () => {
    const impact = directionEditImpact(saved, { ...same, objectives: [same.objectives[1]] });
    expect(impact.objectives).toEqual([expect.objectContaining({ id: 'a', removed: true, approved: 2 })]);
    expect(directionEditImpact(saved, { ...same, objectives: [...same.objectives].reverse() })).toMatchObject({ lessonIntroduction: true, total: 1 });
  });
});

describe('objectives to prepare', () => {
  const objectives = [{ id: 'b', revision: 1, position: 1 }, { id: 'a', revision: 2, position: 0 }, { id: 'c', revision: 1, position: 2 }];
  it('lists objectives with no current, usable materials in lesson order', () => {
    const artifacts = [
      artifact({ objective_id: 'a', objective_revision: 1 }),
      artifact({ id: 'b1', objective_id: 'b', objective_revision: 1, status: 'draft' }),
      artifact({ id: 'c1', objective_id: 'c', objective_revision: 1, status: 'rejected' }),
    ];
    expect(unpreparedObjectives(objectives, artifacts).map(item => item.id)).toEqual(['a', 'c']);
  });
});

describe('next review step', () => {
  const order = [
    { objectiveId: null, key: 'lesson', approved: false, hasMaterial: true },
    { objectiveId: 'a', key: 'introduction', approved: true, hasMaterial: true },
    { objectiveId: 'a', key: 'exploration', approved: false, hasMaterial: false },
    { objectiveId: 'b', key: 'introduction', approved: false, hasMaterial: true },
  ];
  it('prefers material waiting for review after the current step, then wraps around', () => {
    expect(nextReviewStep(order, { objectiveId: null, key: 'lesson' })).toMatchObject({ objectiveId: 'b', key: 'introduction' });
    expect(nextReviewStep(order, { objectiveId: 'b', key: 'introduction' })).toMatchObject({ objectiveId: null, key: 'lesson' });
  });
  it('falls back to steps still to generate, and returns null when all is approved', () => {
    const generateOnly = order.map(step => ({ ...step, hasMaterial: false }));
    expect(nextReviewStep(generateOnly, { objectiveId: 'a', key: 'introduction' })).toMatchObject({ objectiveId: 'a', key: 'exploration' });
    expect(nextReviewStep(order.map(step => ({ ...step, approved: true })), { objectiveId: null, key: 'lesson' })).toBeNull();
  });
});

describe('audienceSummary', () => {
  const fmt = (grade: string) => grade.toUpperCase();
  it('names the count, grade and school', () => {
    expect(audienceSummary({ schoolName: 'Hillside', gradeLevel: 'jhs 1', students: 42 }, fmt)).toBe('All 42 JHS 1 students at Hillside');
    expect(audienceSummary({ schoolName: 'Hillside', gradeLevel: 'jhs 1', students: 1 }, fmt)).toBe('The 1 JHS 1 student at Hillside');
  });
  it('explains an empty grade and an unknown count', () => {
    expect(audienceSummary({ schoolName: null, gradeLevel: 'jhs 1', students: 0 }, fmt)).toContain('None have joined yet');
    expect(audienceSummary({ schoolName: null, gradeLevel: 'jhs 1', students: null }, fmt)).toBe('Every JHS 1 student');
    expect(audienceSummary(null, fmt)).toBeNull();
  });
});
