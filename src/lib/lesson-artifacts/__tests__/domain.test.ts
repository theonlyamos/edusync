import { describe, expect, it } from 'vitest';

import {
  buildPublicationManifest,
  structuredQuizPayloadSchema,
  toStudentSafeArtifact,
  type LessonArtifactRecord,
} from '../domain';
import { hasObjectiveMastery } from '../mastery';
import { consumedArtifactIdsFromEvents, selectNextPublishedArtifact } from '../resolver';

const quizPayload = {
  kind: 'structured_quiz' as const,
  title: 'Forces check',
  questions: [
    {
      id: 'q1',
      type: 'multiple_choice' as const,
      prompt: 'Which force pulls objects toward Earth?',
      options: ['Gravity', 'Friction', 'Magnetism', 'Tension'],
      correctAnswer: 'Gravity',
      explanation: 'Gravity attracts masses.',
      points: 1,
    },
    {
      id: 'q2',
      type: 'true_false' as const,
      prompt: 'Friction can slow a moving object.',
      correctAnswer: true,
      explanation: 'Friction opposes relative motion.',
      points: 1,
    },
    {
      id: 'q3',
      type: 'numeric' as const,
      prompt: 'How many newtons are in a 2 N force?',
      correctAnswer: 2,
      tolerance: 0,
      explanation: 'The value is already expressed in newtons.',
      points: 1,
    },
  ],
};

function artifact(overrides: Partial<LessonArtifactRecord> = {}): LessonArtifactRecord {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    lessonId: '00000000-0000-4000-8000-000000000010',
    objectiveId: '00000000-0000-4000-8000-000000000020',
    seriesId: '00000000-0000-4000-8000-000000000030',
    version: 1,
    objectiveRevision: 1,
    kind: 'structured_quiz',
    status: 'approved',
    position: 0,
    payload: quizPayload,
    source: 'ai_generated',
    ...overrides,
  };
}

describe('structured quiz contracts', () => {
  it('requires at least three deterministic questions', () => {
    const result = structuredQuizPayloadSchema.safeParse({
      ...quizPayload,
      questions: quizPayload.questions.slice(0, 2),
    });

    expect(result.success).toBe(false);
  });

  it('removes answer keys from student payloads', () => {
    const safe = toStudentSafeArtifact(artifact());

    expect(safe.payload.kind).toBe('structured_quiz');
    if (safe.payload.kind !== 'structured_quiz') throw new Error('unexpected payload');
    expect(safe.payload.questions[0]).not.toHaveProperty('correctAnswer');
    expect(safe.payload.questions[0]).not.toHaveProperty('explanation');
  });

  it('rejects duplicate question identifiers', () => {
    const result = structuredQuizPayloadSchema.safeParse({
      ...quizPayload,
      questions: quizPayload.questions.map((question) => ({ ...question, id: 'duplicate' })),
    });

    expect(result.success).toBe(false);
  });

  it('rejects duplicate options and answers outside the available options', () => {
    const duplicateOptions = structuredQuizPayloadSchema.safeParse({
      ...quizPayload,
      questions: [
        {
          ...quizPayload.questions[0],
          options: ['Gravity', 'Gravity'],
        },
        ...quizPayload.questions.slice(1),
      ],
    });
    const impossibleAnswer = structuredQuizPayloadSchema.safeParse({
      ...quizPayload,
      questions: [
        {
          ...quizPayload.questions[0],
          correctAnswer: 'Buoyancy',
        },
        ...quizPayload.questions.slice(1),
      ],
    });

    expect(duplicateOptions.success).toBe(false);
    expect(impossibleAnswer.success).toBe(false);
  });
});

describe('publication readiness', () => {
  it('publishes with warnings when the recommended objective bundle is incomplete', () => {
    const manifest = buildPublicationManifest({
      lesson: {
        id: '00000000-0000-4000-8000-000000000010',
        title: 'Forces',
        subject: 'Science',
        gradeLevel: '6',
        content: 'A lesson about forces.',
      },
      objectives: [
        {
          id: '00000000-0000-4000-8000-000000000020',
          text: 'Explain how forces change motion.',
          position: 0,
          revision: 1,
        },
      ],
      artifacts: [artifact()],
    });

    expect(manifest.objectives).toHaveLength(1);
    expect(manifest.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'missing_interactive_visualizations' }),
        expect.objectContaining({ code: 'missing_generated_image' }),
        expect.objectContaining({ code: 'missing_visual_quiz' }),
      ]),
    );
  });

  it('excludes approved artifacts created for an older objective revision', () => {
    const manifest = buildPublicationManifest({
      lesson: {
        id: '00000000-0000-4000-8000-000000000010',
        title: 'Forces',
        subject: 'Science',
        gradeLevel: '6',
        content: 'A lesson about forces.',
      },
      objectives: [
        {
          id: '00000000-0000-4000-8000-000000000020',
          text: 'Revised objective wording.',
          position: 0,
          revision: 2,
        },
      ],
      artifacts: [artifact({ objectiveRevision: 1 })],
    });

    expect(manifest.objectives[0].artifactIds).toEqual([]);
    expect(manifest.warnings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'missing_structured_quiz' })]),
    );
  });

  it('pins only the latest approved version from each logical artifact series', () => {
    const first = artifact({ id: '00000000-0000-4000-8000-000000000301', version: 1 });
    const replacement = artifact({ id: '00000000-0000-4000-8000-000000000302', version: 2 });
    const manifest = buildPublicationManifest({
      lesson: { id: first.lessonId, title: 'Forces', subject: 'Science', gradeLevel: '6', content: null },
      objectives: [{ id: first.objectiveId, text: 'Explain forces.', position: 0, revision: 1 }],
      artifacts: [first, replacement],
    });

    expect(manifest.objectives[0].artifactIds).toEqual([replacement.id]);
  });
});

describe('approved-first selection', () => {
  it('only treats rendered or attempted artifacts as exhausted across learning runs', () => {
    const consumed = consumedArtifactIdsFromEvents([
      { artifactId: 'resolved-only', eventType: 'artifact_resolved' },
      { artifactId: 'rendered', eventType: 'artifact_rendered' },
      { artifactId: 'quiz', eventType: 'quiz_submitted' },
      { artifactId: null, eventType: 'visual_quiz_completed' },
    ]);

    expect([...consumed]).toEqual(['rendered', 'quiz']);
  });

  it('selects the next teacher-ordered published artifact not consumed by the learner', () => {
    const first = artifact({
      id: '00000000-0000-4000-8000-000000000101',
      position: 0,
    });
    const second = artifact({
      id: '00000000-0000-4000-8000-000000000102',
      position: 1,
    });

    const selected = selectNextPublishedArtifact({
      artifacts: [second, first],
      publishedArtifactIds: new Set([first.id, second.id]),
      consumedArtifactIds: new Set([first.id]),
      kind: 'quiz',
    });

    expect(selected?.id).toBe(second.id);
  });

  it('treats a newly published version as unseen without resetting history', () => {
    const oldVersion = artifact({
      id: '00000000-0000-4000-8000-000000000201',
      version: 1,
    });
    const newVersion = artifact({
      id: '00000000-0000-4000-8000-000000000202',
      version: 2,
    });

    const selected = selectNextPublishedArtifact({
      artifacts: [oldVersion, newVersion],
      publishedArtifactIds: new Set([newVersion.id]),
      consumedArtifactIds: new Set([oldVersion.id]),
      kind: 'quiz',
    });

    expect(selected?.id).toBe(newVersion.id);
  });
});

describe('objective mastery', () => {
  it('requires an approved structured quiz score of at least 80 percent for the current objective revision', () => {
    expect(
      hasObjectiveMastery({
        objectiveRevision: 2,
        attempts: [
          { source: 'teacher_approved', artifactKind: 'structured_quiz', objectiveRevision: 1, percentage: 100 },
          { source: 'session_generated', artifactKind: 'structured_quiz', objectiveRevision: 2, percentage: 100 },
          { source: 'teacher_approved', artifactKind: 'structured_quiz', objectiveRevision: 2, percentage: 79 },
          { source: 'teacher_approved', artifactKind: 'structured_quiz', objectiveRevision: 2, percentage: 80 },
        ],
      }),
    ).toBe(true);
  });

  it('does not count visual puzzles or generated fallback quizzes as mastery evidence', () => {
    expect(
      hasObjectiveMastery({
        objectiveRevision: 1,
        attempts: [
          { source: 'teacher_approved', artifactKind: 'visual_quiz', objectiveRevision: 1, percentage: 100 },
          { source: 'session_generated', artifactKind: 'structured_quiz', objectiveRevision: 1, percentage: 100 },
        ],
      }),
    ).toBe(false);
  });
});
