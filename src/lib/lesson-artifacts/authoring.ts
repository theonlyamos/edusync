import { createHash } from 'node:crypto';
import { z } from 'zod';

import { structuredQuizPayloadSchema, type ArtifactPayload } from './domain';

const objectiveInputSchema = z.object({
  id: z.string().uuid().optional(),
  text: z.string().trim().min(1).max(500),
});

export const authoringUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    subject: z.string().trim().min(1).max(120),
    gradeLevel: z.string().trim().min(1).max(80),
    content: z.string().max(100_000).nullable().default(null),
    objectives: z.array(objectiveInputSchema).min(1).max(20),
  })
  .transform((input) => ({
    ...input,
    objectives: input.objectives.map((objective, position) => ({
      ...(objective.id ? { id: objective.id } : {}),
      text: objective.text,
      position,
    })),
  }));

export const lessonDraftGenerationSchema = z.object({
  title: z.string().trim().min(1).max(160),
  subject: z.string().trim().min(1).max(120),
  gradeLevel: z.string().trim().min(1).max(80),
  teacherBrief: z.string().trim().max(4_000).optional(),
});

export const generatedLessonDraftSchema = z.object({
  title: z.string().trim().min(1).max(160),
  overview: z.string().trim().min(1).max(4_000),
  content: z.string().trim().min(1).max(100_000),
  objectives: z.array(z.string().trim().min(1).max(500)).min(1).max(20),
});

type LessonDraftGenerationInput = z.infer<typeof lessonDraftGenerationSchema>;
type LessonDraftGenerator = (systemPrompt: string, userPrompt: string) => Promise<string | null | undefined>;

const lessonDraftShape = '{"title": string, "overview": string, "content": markdown string, "objectives": string[]}';

function parseGeneratedLessonDraft(raw: string | null | undefined) {
  if (!raw?.trim()) throw new Error('AI returned an empty lesson draft');
  const withoutFence = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const start = withoutFence.indexOf('{');
  const end = withoutFence.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('AI lesson draft did not contain a JSON object');
  return generatedLessonDraftSchema.parse(JSON.parse(withoutFence.slice(start, end + 1)));
}

export async function generateLessonDraftWithRetry(
  input: LessonDraftGenerationInput,
  generate: LessonDraftGenerator,
) {
  const requestPrompt = `Create a lesson draft for:\nTitle: ${input.title}\nSubject: ${input.subject}\nGrade: ${input.gradeLevel}\nTeacher brief: ${input.teacherBrief || 'None'}\n\nReturn ${lessonDraftShape}. Objectives must be measurable and concise.`;
  const first = await generate(
    'You are an experienced curriculum designer. Return only valid JSON for an engaging, age-appropriate lesson draft.',
    requestPrompt,
  );
  try {
    return parseGeneratedLessonDraft(first);
  } catch (firstError) {
    const repaired = await generate(
      'You repair curriculum JSON. Return only one valid JSON object with no markdown fences or commentary.',
      `Repair the candidate so it matches this exact shape: ${lessonDraftShape}. Preserve the educational meaning, ensure all JSON string characters are escaped, and keep objectives measurable.\n\n<INVALID_CANDIDATE>\n${(first ?? '').slice(0, 20_000)}\n</INVALID_CANDIDATE>`,
    );
    try {
      return parseGeneratedLessonDraft(repaired);
    } catch (repairError) {
      throw new Error('AI returned an invalid lesson draft after one repair attempt', { cause: repairError ?? firstError });
    }
  }
}

export const artifactReviewSchema = z.object({
  decision: z.enum(['approve', 'reject']),
});

export function isArtifactReadyForApproval(
  kind: string,
  validationReport: { status?: unknown; validator?: unknown } | null | undefined,
): boolean {
  if (!['interactive_visualization', 'visual_quiz'].includes(kind)) {
    return validationReport?.status === 'passed';
  }
  return validationReport?.status === 'passed' && validationReport?.validator === 'sandbox-runtime';
}

export interface BundleJobSpec {
  lessonId: string;
  objectiveId: string;
  requestedBy: string;
  jobType:
    | 'generate_interactive'
    | 'generate_image'
    | 'generate_structured_quiz'
    | 'generate_visual_quiz';
  idempotencyKey: string;
  position: number;
}

export function buildDefaultBundleJobs(input: {
  lessonId: string;
  objectiveId: string;
  requestedBy: string;
  idempotencyPrefix: string;
}): BundleJobSpec[] {
  const types: BundleJobSpec['jobType'][] = [
    'generate_interactive',
    'generate_interactive',
    'generate_image',
    'generate_structured_quiz',
    'generate_visual_quiz',
  ];

  return types.map((jobType, position) => ({
    lessonId: input.lessonId,
    objectiveId: input.objectiveId,
    requestedBy: input.requestedBy,
    jobType,
    idempotencyKey: `${input.idempotencyPrefix}:${jobType}:${position}`,
    position,
  }));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

export function createPublicationHash(manifest: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(manifest))).digest('hex');
}

export type QuizAnswer = string | string[] | boolean | number;

const valuesEqual = (expected: QuizAnswer, actual: QuizAnswer | undefined, tolerance = 0) => {
  if (typeof expected === 'number') {
    return typeof actual === 'number' && Math.abs(expected - actual) <= tolerance;
  }
  if (Array.isArray(expected)) {
    return Array.isArray(actual) &&
      expected.length === actual.length &&
      [...expected].sort().every((value, index) => value === [...actual].sort()[index]);
  }
  return expected === actual;
};

export function gradeStructuredQuiz(
  payload: Extract<ArtifactPayload, { kind: 'structured_quiz' }>,
  answers: Record<string, QuizAnswer>,
) {
  const quiz = structuredQuizPayloadSchema.parse(payload);
  let earnedPoints = 0;
  const totalPoints = quiz.questions.reduce((total, question) => total + question.points, 0);
  const results = quiz.questions.map((question) => {
    const tolerance = question.type === 'numeric' ? question.tolerance : 0;
    const correct = valuesEqual(question.correctAnswer, answers[question.id], tolerance);
    if (correct) earnedPoints += question.points;
    return {
      questionId: question.id,
      correct,
      earnedPoints: correct ? question.points : 0,
      possiblePoints: question.points,
      explanation: question.explanation,
      correctAnswer: question.correctAnswer,
    };
  });

  return {
    earnedPoints,
    totalPoints,
    percentage: totalPoints === 0 ? 0 : Math.round((earnedPoints / totalPoints) * 100),
    results,
  };
}
