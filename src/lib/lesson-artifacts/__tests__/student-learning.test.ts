import { describe, expect, it } from 'vitest';

import {
  buildStudentLessonDetail,
  isObjectiveSelectionChange,
  normalizeLegacyObjectives,
  normalizePublishedObjectives,
  selectPublishedObjective,
  summarizePublishedObjectives,
} from '../student-learning';

describe('student lesson objective contract', () => {
  it('normalizes arrays, JSON strings, and newline-separated legacy objectives', () => {
    expect(normalizeLegacyObjectives([' Explain force. ', '', 'Calculate net force.'])).toEqual([
      'Explain force.',
      'Calculate net force.',
    ]);
    expect(normalizeLegacyObjectives('["Explain force.","Calculate net force."]')).toEqual([
      'Explain force.',
      'Calculate net force.',
    ]);
    expect(normalizeLegacyObjectives('Explain force.\n\nCalculate net force.')).toEqual([
      'Explain force.',
      'Calculate net force.',
    ]);
  });

  it('normalizes structured objective arrays and JSON snapshots without trusting malformed legacy data', () => {
    const objectives = [{
      id: '11111111-1111-4111-8111-111111111111',
      text: ' Explain force. ',
      position: 0,
      revision: 2,
      artifactIds: ['visual-1'],
    }];

    expect(normalizePublishedObjectives(objectives)?.[0]?.text).toBe('Explain force.');
    expect(normalizePublishedObjectives(JSON.stringify(objectives))).toEqual([
      { ...objectives[0], text: 'Explain force.' },
    ]);
    expect(normalizePublishedObjectives('Explain force.\nCalculate force.')).toBeNull();
    expect(normalizePublishedObjectives([{ text: 'Missing immutable objective id' }])).toBeNull();
  });

  it('sorts published objectives and counts only artifacts in each publication snapshot', () => {
    const result = summarizePublishedObjectives({
      objectives: [
        { id: 'objective-2', text: 'Calculate net force.', position: 1, revision: 2, artifactIds: ['quiz-1'] },
        { id: 'objective-1', text: 'Explain force.', position: 0, revision: 1, artifactIds: ['visual-1', 'image-1', 'missing'] },
      ],
      artifacts: [
        { id: 'visual-1', kind: 'interactive_visualization' },
        { id: 'image-1', kind: 'generated_image' },
        { id: 'quiz-1', kind: 'structured_quiz' },
        { id: 'unpublished-quiz', kind: 'visual_quiz' },
      ],
    });

    expect(result).toEqual([
      {
        id: 'objective-1',
        text: 'Explain force.',
        position: 0,
        revision: 1,
        artifactCounts: { visualizations: 2, quizzes: 0, resources: 0 },
      },
      {
        id: 'objective-2',
        text: 'Calculate net force.',
        position: 1,
        revision: 2,
        artifactCounts: { visualizations: 0, quizzes: 1, resources: 0 },
      },
    ]);
  });

  it('selects the requested published objective or defaults to the first objective', () => {
    const objectives = [
      { id: 'objective-2', text: 'Second', position: 1, revision: 1 },
      { id: 'objective-1', text: 'First', position: 0, revision: 1 },
    ];

    expect(selectPublishedObjective(objectives, 'objective-2')?.id).toBe('objective-2');
    expect(selectPublishedObjective(objectives)?.id).toBe('objective-1');
    expect(selectPublishedObjective(objectives, 'stale-objective')).toBeUndefined();
  });

  it('records an objective change only when a resumed run switches objectives', () => {
    expect(isObjectiveSelectionChange(undefined, 'objective-1')).toBe(false);
    expect(isObjectiveSelectionChange('objective-1', 'objective-1')).toBe(false);
    expect(isObjectiveSelectionChange('objective-1', 'objective-2')).toBe(true);
  });

  it('builds lesson details from the immutable publication snapshot', () => {
    const detail = buildStudentLessonDetail({
      publicationVersion: 4,
      manifest: {
        lesson: {
          id: 'lesson-1',
          title: 'Published title',
          subject: 'Physics',
          gradeLevel: 'JHS 1',
          content: 'Published content',
        },
        objectives: [
          { id: 'objective-1', text: 'Explain force.', position: 0, revision: 3, artifactIds: ['visual-1'] },
        ],
      },
      artifacts: [{ id: 'visual-1', kind: 'interactive_visualization' }],
    });

    expect(detail.lesson.title).toBe('Published title');
    expect(detail.publicationVersion).toBe(4);
    expect(detail.objectives[0]?.artifactCounts.visualizations).toBe(1);
  });
});
