import { describe, expect, it } from 'vitest';

import {
  authoringUpdateSchema,
  buildDefaultBundleJobs,
  createPublicationHash,
  gradeStructuredQuiz,
  generateLessonDraftWithRetry,
  isArtifactReadyForApproval,
} from '../authoring';

describe('authoring contracts', () => {
  it('normalizes objective text and assigns deterministic positions', () => {
    const result = authoringUpdateSchema.parse({
      title: 'Forces',
      subject: 'Science',
      gradeLevel: '6',
      content: 'Lesson body',
      objectives: [{ text: '  Explain motion. ' }, { text: 'Compare forces.' }],
    });

    expect(result.objectives).toEqual([
      { text: 'Explain motion.', position: 0 },
      { text: 'Compare forces.', position: 1 },
    ]);
  });

  it('builds the approved five-item starter bundle as isolated jobs', () => {
    const jobs = buildDefaultBundleJobs({
      lessonId: 'lesson-1',
      objectiveId: 'objective-1',
      requestedBy: 'teacher-1',
      idempotencyPrefix: 'bundle-1',
    });

    expect(jobs.map((job) => job.jobType)).toEqual([
      'generate_interactive',
      'generate_interactive',
      'generate_image',
      'generate_structured_quiz',
      'generate_visual_quiz',
    ]);
    expect(new Set(jobs.map((job) => job.idempotencyKey)).size).toBe(5);
  });

  it('creates the same publication hash for semantically identical key order', () => {
    expect(createPublicationHash({ lesson: { title: 'Forces', subject: 'Science' } })).toBe(
      createPublicationHash({ lesson: { subject: 'Science', title: 'Forces' } }),
    );
  });

  it('requires an actual sandbox render before approving generated code', () => {
    expect(isArtifactReadyForApproval('interactive_visualization', { status: 'pending', validator: 'sandbox-runtime' })).toBe(false);
    expect(isArtifactReadyForApproval('visual_quiz', { status: 'passed', validator: 'generation-contract' })).toBe(false);
    expect(isArtifactReadyForApproval('visual_quiz', { status: 'passed', validator: 'sandbox-runtime' })).toBe(true);
    expect(isArtifactReadyForApproval('structured_quiz', { status: 'passed', validator: 'schema' })).toBe(true);
  });

  it('repairs one malformed lesson draft response before failing', async () => {
    const responses = [
      '{"title":"Forces","overview":"Overview","content":"Broken","objectives":["Explain forces"]',
      JSON.stringify({
        title: 'Forces',
        overview: 'A concise overview.',
        content: 'A valid lesson body.',
        objectives: ['Explain balanced forces.'],
      }),
    ];
    const prompts: string[] = [];

    const draft = await generateLessonDraftWithRetry(
      { title: 'Forces', subject: 'Physics', gradeLevel: 'JHS 1', teacherBrief: 'Keep it measurable.' },
      async (_system, user) => {
        prompts.push(user);
        return responses.shift() ?? '';
      },
    );

    expect(draft.objectives).toEqual(['Explain balanced forces.']);
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain('Repair the candidate');
  });
});

describe('structured quiz grading', () => {
  it('grades deterministic questions server-side with partial points', () => {
    const grade = gradeStructuredQuiz(
      {
        kind: 'structured_quiz',
        title: 'Check',
        questions: [
          {
            id: 'a',
            type: 'multiple_choice',
            prompt: 'Pick A',
            options: ['A', 'B'],
            correctAnswer: 'A',
            explanation: 'A is correct.',
            points: 2,
          },
          {
            id: 'b',
            type: 'multiple_select',
            prompt: 'Pick both',
            options: ['A', 'B', 'C'],
            correctAnswer: ['A', 'B'],
            explanation: 'A and B are correct.',
            points: 2,
          },
          {
            id: 'c',
            type: 'numeric',
            prompt: 'Near ten',
            correctAnswer: 10,
            tolerance: 0.5,
            explanation: 'Ten is the target.',
            points: 1,
          },
        ],
      },
      { a: 'A', b: ['B', 'A'], c: 10.4 },
    );

    expect(grade).toMatchObject({ earnedPoints: 5, totalPoints: 5, percentage: 100 });
    expect(grade.results.every((result) => result.correct)).toBe(true);
  });
});
