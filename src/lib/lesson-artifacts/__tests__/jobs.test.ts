import { describe, expect, it } from 'vitest';

import {
  buildArtifactInsert,
  generateArtifactPayload,
  nextFailureStatus,
  type ContentJobRecord,
} from '../jobs';

const baseJob: ContentJobRecord = {
  id: 'job-1',
  lessonId: 'lesson-1',
  objectiveId: 'objective-1',
  requestedBy: 'teacher-1',
  jobType: 'generate_interactive',
  attemptCount: 1,
  maxAttempts: 3,
  input: {
    lessonTitle: 'Forces',
    subject: 'Science',
    gradeLevel: '6',
    objectiveText: 'Explain how forces change motion.',
    objectiveRevision: 2,
    position: 0,
  },
};

describe('content job generation', () => {
  it('creates a reviewable interactive payload from the existing visualization generator', async () => {
    const payload = await generateArtifactPayload(baseJob, {
      visualize: async () => ({ library: 'react', code: 'function App() {}', explanation: 'Explore forces.' }),
      generateText: async () => '',
      generateImage: async () => {
        throw new Error('not used');
      },
    });

    expect(payload).toMatchObject({
      kind: 'interactive_visualization',
      library: 'react',
      code: 'function App() {}',
    });
  });

  it('creates a five-question structured quiz that conforms to the server grading schema', async () => {
    const questions = Array.from({ length: 5 }, (_, index) => ({
      id: `q${index + 1}`,
      type: 'true_false',
      prompt: `Question ${index + 1}`,
      correctAnswer: true,
      explanation: 'Because it is true.',
      points: 1,
    }));

    const payload = await generateArtifactPayload(
      { ...baseJob, jobType: 'generate_structured_quiz' },
      {
        visualize: async () => {
          throw new Error('not used');
        },
        generateText: async () => JSON.stringify({ title: 'Forces check', questions }),
        generateImage: async () => {
          throw new Error('not used');
        },
      },
    );

    expect(payload.kind).toBe('structured_quiz');
    if (payload.kind !== 'structured_quiz') throw new Error('unexpected payload');
    expect(payload.questions).toHaveLength(5);
  });

  it('rejects generated structured quizzes that do not contain exactly five questions', async () => {
    const questions = Array.from({ length: 4 }, (_, index) => ({
      id: `q${index + 1}`, type: 'true_false', prompt: `Question ${index + 1}`,
      correctAnswer: true, explanation: 'Because it is true.', points: 1,
    }));
    await expect(generateArtifactPayload(
      { ...baseJob, jobType: 'generate_structured_quiz' },
      {
        visualize: async () => { throw new Error('not used'); },
        generateText: async () => JSON.stringify({ title: 'Forces check', questions }),
        generateImage: async () => { throw new Error('not used'); },
      },
    )).rejects.toThrow(/five questions/i);
  });

  it('maps successful jobs to immutable draft artifact versions', () => {
    const insert = buildArtifactInsert(baseJob, {
      kind: 'interactive_visualization',
      library: 'react',
      code: 'function App() {}',
      explanation: 'Explore forces.',
      taskDescription: 'Show force and motion.',
    });

    expect(insert).toMatchObject({
      lesson_id: 'lesson-1',
      objective_id: 'objective-1',
      objective_revision: 2,
      kind: 'interactive_visualization',
      status: 'draft',
      position: 0,
      validation_report: { status: 'pending', validator: 'sandbox-runtime' },
    });
  });

  it('preserves the logical series when regenerating an artifact', () => {
    const insert = buildArtifactInsert(
      {
        ...baseJob,
        input: {
          ...baseJob.input,
          seriesId: 'series-1',
          version: 2,
          supersedesId: 'artifact-1',
        },
      },
      {
        kind: 'interactive_visualization',
        library: 'react',
        code: 'function App() {}',
        explanation: 'Explore forces.',
        taskDescription: 'Show force and motion.',
      },
    );

    expect(insert).toMatchObject({ series_id: 'series-1', version: 2, supersedes_id: 'artifact-1' });
  });

  it('requeues transient failures until the maximum attempt is reached', () => {
    expect(nextFailureStatus(1, 3)).toBe('queued');
    expect(nextFailureStatus(3, 3)).toBe('failed');
  });
});
