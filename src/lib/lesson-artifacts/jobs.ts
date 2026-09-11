import { artifactPayloadSchema, type ArtifactPayload } from './domain';
import { materialRoles, type MaterialRole } from './creative-concept';

export type ContentJobType =
  | 'generate_interactive'
  | 'generate_image'
  | 'generate_structured_quiz'
  | 'generate_visual_quiz'
  | 'extract_media'
  | 'embed_media';

export interface ContentJobRecord {
  id: string;
  lessonId: string;
  objectiveId: string | null;
  requestedBy: string;
  jobType: ContentJobType;
  attemptCount: number;
  maxAttempts: number;
  input: {
    lessonTitle: string;
    subject: string;
    gradeLevel: string;
    objectiveText: string;
    objectiveRevision: number;
    position: number;
    seriesId?: string;
    version?: number;
    supersedesId?: string;
    assetId?: string;
    taskDescription?: string;
    visualInstructions?: string;
    objectiveVisualInstructions?: string;
    feedback?: string;
    creativeConcept?: string;
    materialRole?: MaterialRole;
  };
}

export interface ArtifactGenerationDependencies {
  visualize: (taskDescription: string) => Promise<{
    library: 'react' | 'p5' | 'three';
    code: string;
    explanation: string;
  }>;
  generateText: (systemPrompt: string, userPrompt: string) => Promise<string>;
  generateImage: (prompt: string) => Promise<{
    assetId: string;
    altText: string;
    caption: string;
    aspectRatio?: '1:1' | '4:3' | '3:4' | '16:9';
  }>;
}

const roleFor = (job: ContentJobRecord): MaterialRole => job.input.materialRole ?? (
  job.jobType === 'generate_image' ? 'introduction'
    : job.jobType === 'generate_structured_quiz' ? 'knowledgeCheck'
      : job.jobType === 'generate_visual_quiz' ? 'visualChallenge'
        : job.input.position === 2 ? 'application' : 'exploration');

const contextFor = (job: ContentJobRecord) => {
  const taskDescription = job.input.taskDescription?.trim();
  const role = materialRoles[roleFor(job)];
  return `Lesson: ${job.input.lessonTitle}\nSubject: ${job.input.subject}\nGrade: ${job.input.gradeLevel}\n${job.objectiveId ? 'Objective' : 'Lesson objectives'}: ${job.input.objectiveText}${taskDescription ? `\nLearner request: ${taskDescription}` : ''}
${job.input.creativeConcept ? `Accepted shared creative concept (the complete plan for this objective):\n${job.input.creativeConcept}\nUse its planned examples and visual language. You cannot see the other generated materials: implement your assigned role from this plan and make this material self-contained.` : ''}
Assigned material role: ${role}
Teacher visual instructions (constraints that override creative choices; follow requested diagrams, examples, labels and interactions; objective instructions refine lesson defaults):
${job.input.visualInstructions || 'No lesson-specific instructions.'}
${job.input.objectiveVisualInstructions || ''}
${job.input.feedback ? `Revision feedback (highest priority over the creative concept and earlier visual instructions; retain accuracy and accessibility):\n${job.input.feedback}` : ''}`;
};

export async function generateArtifactPayload(
  job: ContentJobRecord,
  dependencies: ArtifactGenerationDependencies,
): Promise<ArtifactPayload> {
  const context = contextFor(job);

  if (job.jobType === 'generate_interactive' || job.jobType === 'generate_visual_quiz') {
    const visualQuiz = job.jobType === 'generate_visual_quiz';
    const taskDescription = visualQuiz
      ? `${context}\nCreate one interactive visual-puzzle quiz that checks this objective, gives immediate explanatory feedback, and is appropriate for the grade.`
      : `${context}\nCreate a focused interactive visualization that lets the learner manipulate one important relationship and observe cause and effect. ${roleFor(job) === 'application' ? 'Use a different example or representation from the introductory exploration; emphasize applying the relationship.' : 'Introduce the relationship through a concrete example.'}`;
    const generated = await dependencies.visualize(taskDescription);
    return artifactPayloadSchema.parse({
      kind: visualQuiz ? 'visual_quiz' : 'interactive_visualization',
      ...generated,
      taskDescription,
    });
  }

  if (job.jobType === 'generate_structured_quiz') {
    const generated = await dependencies.generateText(
      'You generate deterministic, server-gradable educational quizzes. Return only valid JSON.',
      `${context}\nCreate exactly five questions using only multiple_choice, multiple_select, true_false, or numeric. Return {"kind":"structured_quiz","title":string,"questions":[{"id":string,"type":string,"prompt":string,"options"?:string[],"correctAnswer":string|string[]|boolean|number,"tolerance"?:number,"explanation":string,"points":number}]}.`,
    );
    const parsed = JSON.parse(generated);
    const quiz = structuredQuizWithKind(parsed);
    if (quiz.kind !== 'structured_quiz' || quiz.questions.length !== 5) {
      throw new Error('Generated structured quiz must contain exactly five questions');
    }
    return quiz;
  }

  if (job.jobType === 'generate_image') {
    const generated = await dependencies.generateImage(
      `${context}\nCreate a compelling 4:3 introductory educational image. Choose an inventive composition suited to the concept, such as a cutaway scene, illustrated field guide, visual story, comparison or annotated model. ${job.objectiveId ? 'Introduce the objective before any activities: explain its core concept with a concrete example.' : 'Give an overview of the entire lesson and show how its objectives connect.'} Include accurate, readable instructional labels and requested examples; avoid decorative text and misleading metaphors. Keep strong contrast and a clear visual hierarchy. This is a static image: depict any requested interaction as a labeled sequence or before-and-after comparison.`,
    );
    return artifactPayloadSchema.parse({
      kind: 'generated_image',
      introductionFor: job.objectiveId ? 'objective' : 'lesson',
      ...generated,
      aspectRatio: generated.aspectRatio ?? '4:3',
    });
  }

  throw new Error(`Job type ${job.jobType} does not create a lesson artifact`);
}

const structuredQuizWithKind = (value: unknown): ArtifactPayload => {
  const candidate = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return artifactPayloadSchema.parse({ ...candidate, kind: 'structured_quiz' });
};

export function buildArtifactInsert(job: ContentJobRecord, payload: ArtifactPayload) {
  return {
    lesson_id: job.lessonId,
    objective_id: job.objectiveId,
    objective_revision: job.input.objectiveRevision,
    kind: payload.kind,
    status: 'draft' as const,
    position: job.input.position,
    payload,
    source: 'ai_generated' as const,
    validation_report: ['interactive_visualization', 'visual_quiz'].includes(payload.kind)
      ? { status: 'pending', validator: 'sandbox-runtime' }
      : { status: 'passed', validator: 'schema' },
    generation_metadata: { jobId: job.id, materialRole: roleFor(job), visualInstructions: job.input.visualInstructions ?? '', objectiveVisualInstructions: job.input.objectiveVisualInstructions ?? '', feedback: job.input.feedback ?? '', ...(job.input.creativeConcept ? { creativeConcept: job.input.creativeConcept } : {}) },
    created_by: job.requestedBy,
    ...(job.input.seriesId ? { series_id: job.input.seriesId } : {}),
    ...(job.input.version ? { version: job.input.version } : {}),
    ...(job.input.supersedesId ? { supersedes_id: job.input.supersedesId } : {}),
  };
}

export function nextFailureStatus(attemptCount: number, maxAttempts: number): 'queued' | 'failed' {
  return attemptCount < maxAttempts ? 'queued' : 'failed';
}
