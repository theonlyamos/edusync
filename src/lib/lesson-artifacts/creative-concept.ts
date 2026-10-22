import { z } from 'zod';

export const creativeConceptSchema = z.string().trim().min(20).max(4_000);
export const creativeConceptRequestSchema = z.object({
  objectiveRevision: z.number().int().positive(),
  guidance: z.string().trim().max(4_000).optional(),
  previousConcept: z.string().trim().max(4_000).optional(),
});
export const bundleRequestSchema = z.object({
  idempotencyKey: z.string().trim().min(1).max(160).optional(),
  creativeConcept: creativeConceptSchema.optional(),
  objectiveRevision: z.number().int().positive().optional(),
}).refine((input) => !input.creativeConcept || input.objectiveRevision !== undefined, {
  message: 'The accepted concept requires its objective revision', path: ['objectiveRevision'],
});

export const materialRoles = {
  introduction: 'Introduction: create a static visual hook that explains the core concept through a concrete scene and readable labels.',
  exploration: 'Exploration: let learners manipulate a variable, predict an outcome and discover the relationship through immediate visual cause and effect.',
  application: 'Application: use a different representation and concrete scenario from the planned exploration; let learners apply the relationship to solve a practical task.',
  knowledgeCheck: 'Knowledge check: assess understanding and common misconceptions with five varied, server-gradable questions and explanatory feedback.',
  visualChallenge: 'Visual challenge: create a visual puzzle requiring a decision, arrangement or construction with immediate explanatory feedback; use an interaction distinct from the planned exploration and application.',
};
export type MaterialRole = keyof typeof materialRoles;

/** The labelled parts of a creative concept, shown to teachers as separate cards. */
export const conceptSections = [
  { key: 'concept', label: 'Concept', hint: 'a short name, its narrative and visual language' },
  { key: 'introduction', label: 'Introduction', hint: 'the opening image' },
  { key: 'exploration', label: 'Explore', hint: 'what learners change and discover' },
  { key: 'application', label: 'Apply', hint: 'the different situation where they use it' },
  { key: 'knowledgeCheck', label: 'Knowledge check', hint: 'what the questions test' },
  { key: 'visualChallenge', label: 'Visual challenge', hint: 'the visual puzzle and its decision' },
] as const;
export type ConceptSection = { label: string; text: string };

const sectionPattern = new RegExp(`^\\s*(?:[#>*_-]+\\s*)*(?:\\*\\*)?(${conceptSections.map((section) => section.label).join('|')})(?:\\*\\*)?\\s*[:\u2013\u2014-]\\s*(?:\\*\\*)?\\s*`, 'i');

/**
 * Splits a concept into its labelled sections. Returns null for free-form text
 * (older concepts, or ones the teacher wrote differently) so it stays one block.
 */
export function parseConceptSections(concept: string): ConceptSection[] | null {
  const sections: ConceptSection[] = [];
  for (const line of concept.split(/\r?\n/)) {
    const match = line.match(sectionPattern);
    if (match) {
      const label = conceptSections.find((section) => section.label.toLowerCase() === match[1].toLowerCase())!.label;
      sections.push({ label, text: line.slice(match[0].length).trim() });
    } else if (sections.length) {
      const current = sections[sections.length - 1];
      current.text = current.text ? `${current.text}\n${line}` : line;
    } else if (line.trim()) {
      return null;
    }
  }
  const labels = new Set(sections.map((section) => section.label));
  if (labels.size < 4 || labels.size !== sections.length) return null;
  return sections.map((section) => ({ ...section, text: section.text.trim() }));
}

export function joinConceptSections(sections: ConceptSection[]) {
  return sections.map((section) => `${section.label}: ${section.text.trim()}`).join('\n\n');
}

export function artifactMaterialRole(artifact: {
  kind: string;
  position: number;
  payload?: unknown;
  generation_metadata?: { materialRole?: unknown } | null;
}): MaterialRole | null {
  if (artifact.kind === 'generated_image') return 'introduction';
  if (artifact.kind === 'structured_quiz') return 'knowledgeCheck';
  if (artifact.kind === 'visual_quiz') return 'visualChallenge';
  if (artifact.kind !== 'interactive_visualization') return null;
  const explicit = artifact.generation_metadata?.materialRole;
  if (explicit === 'exploration' || explicit === 'application') return explicit;
  const prompt = artifact.payload && typeof artifact.payload === 'object' && 'taskDescription' in artifact.payload && typeof artifact.payload.taskDescription === 'string'
    ? artifact.payload.taskDescription.trim() : '';
  if (prompt.endsWith('Use a different example or representation from the introductory exploration; emphasize applying the relationship.')) return 'application';
  if (prompt.endsWith('Introduce the relationship through a concrete example.')) return 'exploration';
  // Before introduction slots existed, interactive positions were 0 (Explore) and 1 (Apply).
  return artifact.position === 0 ? 'exploration' : 'application';
}

export function creativeConceptPrompt(input: {
  lessonTitle: string;
  subject: string;
  gradeLevel: string;
  objectiveText: string;
  visualInstructions?: string | null;
  objectiveVisualInstructions?: string | null;
  guidance?: string;
  previousConcept?: string;
}) {
  return `Design one inventive, coherent teaching concept for this objective.
Lesson: ${input.lessonTitle}\nSubject: ${input.subject}\nGrade: ${input.gradeLevel}\nObjective: ${input.objectiveText}
Use exactly these six labelled sections, each starting on its own line with the label and a colon, in this order:
${conceptSections.map((section) => `${section.label}: ${section.hint}`).join('\n')}
Material roles:
${Object.values(materialRoles).join('\n')}
Choose distinct representations, examples and interactions across these materials, connected by the shared narrative. Name the actual objects, learner actions and learning payoff, not generic templates. Each material must be understandable independently. Keep scientific accuracy, accessible controls, legible labels and age appropriateness. Return only concise plain text, roughly 200–350 words and at most 4000 characters; no code or JSON.
Teacher instructions are constraints and override creative choices. Objective instructions refine lesson defaults:
${input.visualInstructions || 'No lesson-specific instructions.'}
${input.objectiveVisualInstructions || 'No objective-specific instructions.'}
${input.previousConcept ? `Previous idea (suggest a meaningfully different approach while retaining teacher constraints):\n${input.previousConcept}` : ''}
${input.guidance ? `Latest teacher feedback (highest priority, while retaining accuracy and accessibility):\n${input.guidance}` : ''}`;
}

export function acceptedCreativeConcepts(
  objectives: Array<{ id: string; revision: number }>,
  jobs: Array<{ objective_id: string | null; input: { objectiveRevision?: unknown; creativeConcept?: unknown } | null }>,
) {
  const revisions = new Map(objectives.map((objective) => [objective.id, objective.revision]));
  const concepts: Record<string, { revision: number; concept: string }> = {};
  // Jobs are ordered newest first so the latest accepted plan wins.
  for (const job of jobs) {
    const id = job.objective_id;
    if (!id || concepts[id] || job.input?.objectiveRevision !== revisions.get(id)) continue;
    const parsed = creativeConceptSchema.safeParse(job.input?.creativeConcept);
    if (parsed.success && revisions.has(id)) concepts[id] = { revision: revisions.get(id)!, concept: parsed.data };
  }
  return concepts;
}
