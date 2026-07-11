import { z } from 'zod';

const baseQuestionSchema = z.object({
  id: z.string().min(1),
  prompt: z.string().trim().min(1),
  explanation: z.string().trim().min(1),
  points: z.number().int().positive(),
});

const multipleChoiceQuestionSchema = baseQuestionSchema.extend({
  type: z.literal('multiple_choice'),
  options: z.array(z.string().trim().min(1)).min(2),
  correctAnswer: z.string().trim().min(1),
});

const multipleSelectQuestionSchema = baseQuestionSchema.extend({
  type: z.literal('multiple_select'),
  options: z.array(z.string().trim().min(1)).min(2),
  correctAnswer: z.array(z.string().trim().min(1)).min(1),
});

const trueFalseQuestionSchema = baseQuestionSchema.extend({
  type: z.literal('true_false'),
  correctAnswer: z.boolean(),
});

const numericQuestionSchema = baseQuestionSchema.extend({
  type: z.literal('numeric'),
  correctAnswer: z.number(),
  tolerance: z.number().nonnegative().default(0),
});

export const structuredQuizQuestionSchema = z.discriminatedUnion('type', [
  multipleChoiceQuestionSchema,
  multipleSelectQuestionSchema,
  trueFalseQuestionSchema,
  numericQuestionSchema,
]);

export const structuredQuizPayloadSchema = z.object({
  kind: z.literal('structured_quiz'),
  title: z.string().trim().min(1),
  questions: z.array(structuredQuizQuestionSchema).min(3),
}).superRefine((quiz, context) => {
  const questionIds = new Set<string>();
  quiz.questions.forEach((question, questionIndex) => {
    if (questionIds.has(question.id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['questions', questionIndex, 'id'],
        message: 'Question identifiers must be unique',
      });
    }
    questionIds.add(question.id);

    if (question.type !== 'multiple_choice' && question.type !== 'multiple_select') return;
    const normalizedOptions = question.options.map((option) => option.toLocaleLowerCase());
    if (new Set(normalizedOptions).size !== normalizedOptions.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['questions', questionIndex, 'options'],
        message: 'Question options must be unique',
      });
    }
    const answers = Array.isArray(question.correctAnswer) ? question.correctAnswer : [question.correctAnswer];
    if (new Set(answers.map((answer) => answer.toLocaleLowerCase())).size !== answers.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['questions', questionIndex, 'correctAnswer'],
        message: 'Correct answers must be unique',
      });
    }
    if (answers.some((answer) => !question.options.includes(answer))) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['questions', questionIndex, 'correctAnswer'],
        message: 'Every correct answer must be one of the available options',
      });
    }
  });
});

const generatedCodePayloadFields = {
  library: z.enum(['react', 'p5', 'three']),
  code: z.string().min(1),
  explanation: z.string().trim().min(1),
  taskDescription: z.string().trim().min(1),
};

export const interactiveVisualizationPayloadSchema = z.object({
  kind: z.literal('interactive_visualization'),
  ...generatedCodePayloadFields,
});

export const visualQuizPayloadSchema = z.object({
  kind: z.literal('visual_quiz'),
  ...generatedCodePayloadFields,
});

export const generatedImagePayloadSchema = z.object({
  kind: z.literal('generated_image'),
  assetId: z.string().uuid(),
  altText: z.string().trim().min(1),
  caption: z.string().trim().min(1),
  aspectRatio: z.enum(['1:1', '4:3', '3:4', '16:9']).default('4:3'),
});

export const uploadedMediaPayloadSchema = z.object({
  kind: z.literal('uploaded_media'),
  assetId: z.string().uuid(),
  title: z.string().trim().min(1),
  caption: z.string().trim().optional(),
  mimeType: z.string().trim().min(1),
  originalFilename: z.string().trim().min(1),
});

export const artifactPayloadSchema = z.union([
  interactiveVisualizationPayloadSchema,
  generatedImagePayloadSchema,
  structuredQuizPayloadSchema,
  visualQuizPayloadSchema,
  uploadedMediaPayloadSchema,
]);

export type ArtifactPayload = z.infer<typeof artifactPayloadSchema>;
export type ArtifactKind = ArtifactPayload['kind'];
export type ArtifactStatus = 'draft' | 'approved' | 'failed' | 'rejected';
export type ArtifactSource = 'ai_generated' | 'teacher_uploaded' | 'teacher_authored';

export interface LessonArtifactRecord {
  id: string;
  lessonId: string;
  objectiveId: string;
  seriesId: string;
  version: number;
  objectiveRevision: number;
  supersedesId?: string | null;
  kind: ArtifactKind;
  status: ArtifactStatus;
  position: number;
  payload: ArtifactPayload;
  source: ArtifactSource;
}

type StudentSafeQuestion = Omit<z.infer<typeof structuredQuizQuestionSchema>, 'correctAnswer' | 'explanation'>;

export type StudentSafeArtifactPayload =
  | Exclude<ArtifactPayload, z.infer<typeof structuredQuizPayloadSchema>>
  | {
      kind: 'structured_quiz';
      title: string;
      questions: StudentSafeQuestion[];
    };

export type StudentSafeArtifact = Omit<LessonArtifactRecord, 'payload' | 'source'> & {
  payload: StudentSafeArtifactPayload;
};

export function toStudentSafeArtifact(artifact: LessonArtifactRecord): StudentSafeArtifact {
  const { source: _source, payload, ...safeArtifact } = artifact;
  if (payload.kind !== 'structured_quiz') {
    return { ...safeArtifact, payload };
  }

  return {
    ...safeArtifact,
    payload: {
      kind: payload.kind,
      title: payload.title,
      questions: payload.questions.map(({ correctAnswer: _answer, explanation: _explanation, ...question }) => question),
    },
  };
}

export interface PublicationWarning {
  objectiveId: string;
  code:
    | 'missing_interactive_visualizations'
    | 'missing_generated_image'
    | 'missing_structured_quiz'
    | 'missing_visual_quiz';
  message: string;
}

export interface PublicationManifestInput {
  lesson: {
    id: string;
    title: string;
    subject: string;
    gradeLevel: string;
    content: string | null;
  };
  objectives: Array<{
    id: string;
    text: string;
    position: number;
    revision: number;
  }>;
  artifacts: LessonArtifactRecord[];
}

export function buildPublicationManifest(input: PublicationManifestInput) {
  const warnings: PublicationWarning[] = [];
  const objectives = [...input.objectives]
    .sort((a, b) => a.position - b.position)
    .map((objective) => {
      const matchingApproved = input.artifacts.filter(
          (item) =>
            item.objectiveId === objective.id &&
            item.objectiveRevision === objective.revision &&
            item.status === 'approved',
        );
      const latestBySeries = new Map<string, LessonArtifactRecord>();
      for (const item of matchingApproved) {
        const current = latestBySeries.get(item.seriesId);
        if (!current || item.version > current.version) latestBySeries.set(item.seriesId, item);
      }
      const approved = [...latestBySeries.values()].sort((a, b) => a.position - b.position);
      const interactiveCount = approved.filter((item) => item.kind === 'interactive_visualization').length;

      if (interactiveCount < 2) {
        warnings.push({
          objectiveId: objective.id,
          code: 'missing_interactive_visualizations',
          message: `Recommended: 2 interactive visualizations; approved: ${interactiveCount}.`,
        });
      }
      if (!approved.some((item) => item.kind === 'generated_image')) {
        warnings.push({ objectiveId: objective.id, code: 'missing_generated_image', message: 'No approved generated image.' });
      }
      if (!approved.some((item) => item.kind === 'structured_quiz')) {
        warnings.push({ objectiveId: objective.id, code: 'missing_structured_quiz', message: 'No approved structured quiz.' });
      }
      if (!approved.some((item) => item.kind === 'visual_quiz')) {
        warnings.push({ objectiveId: objective.id, code: 'missing_visual_quiz', message: 'No approved visual quiz.' });
      }

      return {
        ...objective,
        artifactIds: approved.map((item) => item.id),
      };
    });

  return {
    lesson: { ...input.lesson },
    objectives,
    warnings,
  };
}
