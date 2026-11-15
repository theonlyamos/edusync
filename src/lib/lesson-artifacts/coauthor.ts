import { z } from 'zod';

import { conceptSections, creativeConceptSchema } from './creative-concept';
import { structuredQuizPayloadSchema, type ArtifactPayload } from './domain';
import { SKETCH_ROLES, sketchTaskSchema, type SketchRole } from './sketch';
import { getStudioMaterials, type StudioArtifact } from './studio-state';

/**
 * The lesson co-author: a chat partner in the Objective Studio.
 *
 * It never changes the lesson itself. Each reply can carry a few proposals,
 * and the teacher applies them from the Studio, which sends them through the
 * same routes (and the same checks, warnings and credits) as a manual edit.
 */

export const COAUTHOR_MAX_MESSAGES = 30;
export const COAUTHOR_MAX_PROPOSALS = 4;
const LESSON_CONTENT_CONTEXT_CHARS = 12_000;
const MATERIAL_CONTEXT_CHARS = 400;

export const coauthorMessageSchema = z.object({
  role: z.enum(['teacher', 'coauthor']),
  text: z.string().trim().min(1).max(4_000),
});
export type CoauthorMessage = z.infer<typeof coauthorMessageSchema>;

export const coauthorFocusSchema = z.object({
  step: z.enum(['direction', 'lesson', 'objective', 'publish']),
  objectiveId: z.string().uuid().nullish(),
  materialKey: z.string().max(40).nullish(),
  artifactId: z.string().uuid().nullish(),
  /** The teacher's unsaved concept text for the objective on screen. */
  conceptDraft: z.string().max(4_000).nullish(),
});
export type CoauthorFocus = z.infer<typeof coauthorFocusSchema>;

export const coauthorRequestSchema = z.object({
  messages: z.array(coauthorMessageSchema).min(1).max(COAUTHOR_MAX_MESSAGES),
  focus: coauthorFocusSchema.nullish(),
}).refine((input) => input.messages[input.messages.length - 1]?.role === 'teacher', {
  message: 'The last message must be from the teacher', path: ['messages'],
});

const summary = z.string().trim().min(1).max(200);

/** What the model may return. Validated again against the lesson in {@link validateProposals}. */
const rawProposalSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('objectives'), summary,
    objectives: z.array(z.object({
      id: z.string().nullish(),
      text: z.string().trim().min(1).max(500),
      visualInstructions: z.string().trim().max(4_000).nullish(),
    })).min(1).max(20),
  }),
  z.object({ type: z.literal('lesson_direction'), summary, visualInstructions: z.string().trim().max(4_000) }),
  z.object({ type: z.literal('concept'), summary, objectiveId: z.string(), concept: z.string() }),
  z.object({ type: z.literal('regenerate'), summary, artifactId: z.string(), feedback: z.string().trim().min(1).max(4_000) }),
  z.object({ type: z.literal('quiz'), summary, artifactId: z.string(), questions: z.array(z.unknown()).min(1).max(30) }),
  z.object({ type: z.literal('content'), summary, content: z.string().trim().min(1).max(100_000) }),
  z.object({ type: z.literal('generate_introduction'), summary }),
  z.object({ type: z.literal('generate_materials'), summary, objectiveId: z.string(), concept: z.string().nullish() }),
  z.object({ type: z.literal('prepare_all'), summary }),
  z.object({ type: z.literal('sketch'), summary, objectiveId: z.string(), role: z.enum(SKETCH_ROLES), taskDescription: z.string() }),
]);

type QuizPayload = z.infer<typeof structuredQuizPayloadSchema>;

/** A proposal checked against the lesson, ready for the Studio to apply. */
export type CoauthorProposal =
  | { type: 'objectives'; summary: string; objectives: Array<{ id?: string; text: string; visualInstructions?: string }> }
  | { type: 'lesson_direction'; summary: string; visualInstructions: string }
  | { type: 'concept'; summary: string; objectiveId: string; objectiveRevision: number; concept: string }
  | { type: 'regenerate'; summary: string; artifactId: string; objectiveId: string | null; materialKey: string; feedback: string }
  | { type: 'quiz'; summary: string; artifactId: string; objectiveId: string; materialKey: string; payload: QuizPayload }
  | { type: 'content'; summary: string; content: string }
  | { type: 'generate_introduction'; summary: string }
  /** All five materials for one objective, from this concept (or the one already in the Studio). */
  | { type: 'generate_materials'; summary: string; objectiveId: string; objectiveRevision: number; concept?: string }
  | { type: 'prepare_all'; summary: string }
  /** A quick draft visual drawn in the chat; the teacher can redraw it or keep it as a material. */
  | { type: 'sketch'; summary: string; objectiveId: string; role: SketchRole; taskDescription: string };

export type CoauthorReply = { reply: string; proposals: CoauthorProposal[] };

export type CoauthorLessonState = {
  lesson: { title: string; subject: string; gradeLevel: string; content: string | null; visualInstructions: string };
  objectives: Array<{ id: string; text: string; position: number; revision: number; visualInstructions: string }>;
  artifacts: StudioArtifact[];
  concepts: Record<string, { revision: number; concept: string }>;
};

const REGENERABLE = new Set(['interactive_visualization', 'generated_image', 'structured_quiz', 'visual_quiz']);

const lessonTextClipped = (content: string | null) => (content?.length ?? 0) > LESSON_CONTENT_CONTEXT_CHARS;
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text);

function describePayload(payload: ArtifactPayload): string {
  switch (payload.kind) {
    case 'generated_image': return `image. Caption: ${payload.caption}`;
    case 'interactive_visualization':
    case 'visual_quiz': return `${payload.kind === 'visual_quiz' ? 'visual quiz' : 'interactive visual'}. Brief: ${clip(payload.taskDescription, MATERIAL_CONTEXT_CHARS)}`;
    case 'structured_quiz': return `quiz "${payload.title}". Questions JSON: ${JSON.stringify(payload.questions)}`;
    case 'uploaded_media': return `teacher upload "${payload.title}"`;
  }
}

/** The current material for each slot of one objective, as the Studio shows it. */
function currentMaterials(state: CoauthorLessonState, objectiveId: string, revision: number) {
  return getStudioMaterials(state.artifacts, objectiveId, revision).map((material) => ({
    material,
    artifact: material.artifacts.find((item) => item.objective_revision === revision),
  }));
}

function lessonIntroduction(state: CoauthorLessonState) {
  return state.artifacts
    .filter((item) => item.objective_id === null && item.payload.kind === 'generated_image' && item.payload.introductionFor === 'lesson')
    .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '') || b.version - a.version)[0];
}

/** A compact, plain-text picture of the lesson for the model. Ids are in [brackets]. */
export function buildCoauthorContext(state: CoauthorLessonState, focus?: CoauthorFocus | null): string {
  const { lesson } = state;
  const lines = [
    `Lesson: ${lesson.title}`,
    `Subject: ${lesson.subject} · Grade: ${lesson.gradeLevel}`,
    `Creative direction for the lesson: ${lesson.visualInstructions.trim() || '(none yet)'}`,
    `Lesson text (${lesson.content ? `${lesson.content.length} characters` : 'empty'}):`,
    lesson.content ? clip(lesson.content, LESSON_CONTENT_CONTEXT_CHARS) : '(none yet)',
    ...(lessonTextClipped(lesson.content) ? ['(The lesson text was cut short here, so do not propose a "content" rewrite; suggest edits in words instead.)'] : []),
  ];
  const intro = lessonIntroduction(state);
  lines.push('', `Lesson introduction image: ${intro ? `[${intro.id}] ${intro.status}, ${describePayload(intro.payload)}` : 'not generated yet'}`);
  lines.push('', 'Objectives (in order):');
  if (!state.objectives.length) lines.push('(none yet)');
  for (const objective of [...state.objectives].sort((a, b) => a.position - b.position)) {
    lines.push(`${objective.position + 1}. [${objective.id}] ${objective.text}`);
    lines.push(`   Visual directions: ${objective.visualInstructions.trim() || '(none)'}`);
    const concept = focus?.objectiveId === objective.id && focus.conceptDraft?.trim()
      ? `${focus.conceptDraft.trim()} (unsaved draft on screen)`
      : state.concepts[objective.id]?.revision === objective.revision ? state.concepts[objective.id].concept : '';
    lines.push(`   Creative concept: ${concept ? clip(concept, 1_500).replace(/\n+/g, ' | ') : '(none yet)'}`);
    for (const { material, artifact } of currentMaterials(state, objective.id, objective.revision)) {
      lines.push(`   - ${material.label}: ${artifact ? `[${artifact.id}] ${artifact.status}, ${describePayload(artifact.payload)}` : 'not generated for the current directions'}`);
    }
  }
  if (focus) {
    const objective = state.objectives.find((item) => item.id === focus.objectiveId);
    const where = focus.step === 'objective' && objective
      ? `objective ${objective.position + 1}, ${focus.materialKey === 'concept' ? 'its creative concept' : `the ${focus.materialKey ?? 'material'} step`}${focus.artifactId ? ` (material [${focus.artifactId}])` : ''}`
      : { direction: 'the lesson direction step', lesson: 'the lesson introduction', publish: 'the review and publish step', objective: 'an objective' }[focus.step];
    lines.push('', `The teacher is looking at ${where}. "This" or "here" usually means that.`);
  }
  return lines.join('\n');
}

export function buildCoauthorSystemPrompt() {
  const conceptLabels = conceptSections.map((section) => `${section.label}: <${section.hint}>`).join('\\n\\n');
  return `You are the lesson co-author in InsyteAI's Objective Studio, working with a teacher on one lesson.

How you work:
- Talk like a thoughtful colleague. Keep replies short: 1-4 sentences, or a short list.
- When the request is vague or you lack something important (the class, their prior knowledge, time available, common misconceptions), ask one or two focused questions instead of guessing.
- When you know what to change, offer it as proposals. Never say you changed anything: the teacher reviews each proposal and applies it. Say what each proposal does in your reply.
- Keep each objective's five materials (introduction image, explore visual, apply visual, knowledge check, visual challenge) varied and rich. Do not turn visuals into single-slider demos or quizzes into a single tap.
- Only refer to objectives and materials by the [ids] in the lesson context. Never invent ids.
- When asked to rehearse as a student, role-play that student briefly and honestly (one line per material: what they think or do, where they get stuck), then propose fixes.
- When the teacher points at a spot on a material, the message gives its position in the preview (left/right, top/bottom, as percentages). Use the material's brief to work out what is likely there, and propose a remake or edit for that part only.
- You can start any generation the Studio offers: the lesson introduction image, all five materials for an objective, preparing every objective that has none, or remaking one material. These use the school's AI allowance, so propose them when the teacher asks for new or changed materials, and say what will be made.

Answer with one JSON object and nothing else:
{"reply": string, "proposals": Proposal[]}

Proposal is one of (at most ${COAUTHOR_MAX_PROPOSALS}, often none):
- {"type":"objectives","summary":string,"objectives":[{"id":string|null,"text":string,"visualInstructions":string}]}: the FULL new objective list in order. Keep the id of each objective you keep or reword; use null for new ones; leaving one out removes it. Objectives are measurable, starting "Students will be able to".
- {"type":"lesson_direction","summary":string,"visualInstructions":string}: new creative direction for the whole lesson (setting, visual style, examples, labels).
- {"type":"concept","summary":string,"objectiveId":string,"concept":string}: a creative concept for one objective, written exactly as these labelled paragraphs: "${conceptLabels}".
- {"type":"regenerate","summary":string,"artifactId":string,"feedback":string}: remake one material; feedback says precisely what to change.
- {"type":"quiz","summary":string,"artifactId":string,"questions":Question[]}: a corrected knowledge check (structured quiz only). Give the full list of at least 3 questions. Question is {"id":string,"type":"multiple_choice","prompt":string,"options":string[],"correctAnswer":string,"explanation":string,"points":number} or type "multiple_select" (correctAnswer: string[]), "true_false" (correctAnswer: boolean), "numeric" (correctAnswer: number, "tolerance": number). Keep existing question ids when you keep a question.
- {"type":"content","summary":string,"content":string}: the full new lesson text in Markdown (use $...$ for math).
- {"type":"generate_introduction","summary":string}: make a new lesson introduction image from the saved lesson direction.
- {"type":"generate_materials","summary":string,"objectiveId":string,"concept":string|null}: make all five materials for one objective. Give a concept (same labelled format as above) unless the objective already has the one the teacher wants, then use null.
- {"type":"prepare_all","summary":string}: make materials for every objective that has none yet (the AI suggests concepts where missing).
- {"type":"sketch","summary":string,"objectiveId":string,"role":"exploration"|"application"|"visualChallenge","taskDescription":string}: a quick draft visual drawn right in the chat so the teacher can react before committing. taskDescription says the scene, what learners change or decide, labels and feedback. Prefer a sketch when the teacher is still exploring an idea for a visual; when they ask to change a sketch, propose a new sketch with the full updated description. The teacher can keep a sketch as that material.

"summary" is a short label for the proposal card, e.g. "Simplify objective 2 wording".`;
}

export function buildCoauthorUserPrompt(state: CoauthorLessonState, messages: CoauthorMessage[], focus?: CoauthorFocus | null) {
  const transcript = messages.map((message) => `${message.role === 'teacher' ? 'Teacher' : 'Co-author'}: ${message.text}`).join('\n\n');
  return `<lesson>\n${buildCoauthorContext(state, focus)}\n</lesson>\n\n<conversation>\n${transcript}\n</conversation>\n\nWrite the co-author's next reply as JSON.`;
}

function extractJson(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(trimmed.slice(start, end + 1)); }
  catch { return null; }
}

/** Keeps only proposals that point at this lesson's current objectives and materials. */
export function validateProposals(raw: unknown, state: CoauthorLessonState): CoauthorProposal[] {
  if (!Array.isArray(raw)) return [];
  const objectives = new Map(state.objectives.map((objective) => [objective.id, objective]));
  const artifacts = new Map(state.artifacts.map((artifact) => [artifact.id, artifact]));
  const materialKeyFor = (artifact: StudioArtifact) => {
    if (!artifact.objective_id) return 'lesson';
    const objective = objectives.get(artifact.objective_id);
    if (!objective) return null;
    return currentMaterials(state, objective.id, objective.revision).find(({ artifact: current }) => current?.id === artifact.id)?.material.key ?? null;
  };
  const proposals: CoauthorProposal[] = [];
  for (const candidate of raw) {
    if (proposals.length >= COAUTHOR_MAX_PROPOSALS) break;
    const parsed = rawProposalSchema.safeParse(candidate);
    if (!parsed.success) continue;
    const proposal = parsed.data;
    switch (proposal.type) {
      case 'objectives': {
        const seen = new Set<string>();
        proposals.push({
          type: 'objectives', summary: proposal.summary,
          objectives: proposal.objectives.map((objective) => {
            const keep = objective.id && objectives.has(objective.id) && !seen.has(objective.id) ? objective.id : undefined;
            if (keep) seen.add(keep);
            return { ...(keep ? { id: keep } : {}), text: objective.text, ...(objective.visualInstructions ? { visualInstructions: objective.visualInstructions } : {}) };
          }),
        });
        break;
      }
      case 'lesson_direction':
        proposals.push(proposal);
        break;
      case 'concept': {
        const objective = objectives.get(proposal.objectiveId);
        const concept = creativeConceptSchema.safeParse(proposal.concept);
        if (objective && concept.success) proposals.push({ ...proposal, concept: concept.data, objectiveRevision: objective.revision });
        break;
      }
      case 'regenerate': {
        const artifact = artifacts.get(proposal.artifactId);
        const materialKey = artifact && REGENERABLE.has(artifact.kind) ? materialKeyFor(artifact) : null;
        if (artifact && materialKey) proposals.push({ ...proposal, objectiveId: artifact.objective_id, materialKey });
        break;
      }
      case 'quiz': {
        const artifact = artifacts.get(proposal.artifactId);
        if (!artifact || artifact.payload.kind !== 'structured_quiz' || !artifact.objective_id) break;
        const materialKey = materialKeyFor(artifact);
        const payload = structuredQuizPayloadSchema.safeParse({ kind: 'structured_quiz', title: artifact.payload.title, questions: proposal.questions });
        if (materialKey && payload.success) {
          proposals.push({ type: 'quiz', summary: proposal.summary, artifactId: artifact.id, objectiveId: artifact.objective_id, materialKey, payload: payload.data });
        }
        break;
      }
      case 'content':
        // A rewrite of text the co-author only saw part of would drop the rest.
        if (!lessonTextClipped(state.lesson.content)) proposals.push(proposal);
        break;
      case 'generate_introduction':
      case 'prepare_all':
        proposals.push(proposal);
        break;
      case 'sketch': {
        const task = sketchTaskSchema.safeParse(proposal.taskDescription);
        if (objectives.has(proposal.objectiveId) && task.success) proposals.push({ ...proposal, taskDescription: task.data });
        break;
      }
      case 'generate_materials': {
        const objective = objectives.get(proposal.objectiveId);
        if (!objective) break;
        const concept = proposal.concept ? creativeConceptSchema.safeParse(proposal.concept) : null;
        if (concept && !concept.success) break;
        proposals.push({
          type: 'generate_materials', summary: proposal.summary, objectiveId: objective.id, objectiveRevision: objective.revision,
          ...(concept?.success ? { concept: concept.data } : {}),
        });
        break;
      }
    }
  }
  return proposals;
}

const replySchema = z.object({ reply: z.string().trim().min(1).max(6_000), proposals: z.array(z.unknown()).default([]) });

/** Reads the model's answer. Plain text without JSON becomes a reply with no proposals. */
export function parseCoauthorReply(raw: string | null | undefined, state: CoauthorLessonState): CoauthorReply {
  const text = raw?.trim() ?? '';
  if (!text) throw new Error('The co-author returned an empty reply');
  const parsed = replySchema.safeParse(extractJson(text));
  if (!parsed.success) {
    if (text.startsWith('{') || text.startsWith('```')) throw new Error('The co-author returned an unreadable reply');
    return { reply: clip(text, 6_000), proposals: [] };
  }
  return { reply: parsed.data.reply, proposals: validateProposals(parsed.data.proposals, state) };
}
