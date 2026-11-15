import { z } from 'zod';

import { materialRoles } from './creative-concept';

/**
 * Live sketches: quick draft visuals the co-author draws in the chat. A sketch
 * the teacher likes becomes a normal draft material, which still has to pass
 * the sandbox check and the teacher's approval before students see it.
 */

export const SKETCH_ROLES = ['exploration', 'application', 'visualChallenge'] as const;
export type SketchRole = (typeof SKETCH_ROLES)[number];

export const SKETCH_ROLE_LABELS: Record<SketchRole, string> = {
  exploration: 'Explore',
  application: 'Apply',
  visualChallenge: 'Visual challenge',
};

/** Where a kept sketch sits among an objective's five materials (see buildDefaultBundleJobs). */
export const SKETCH_ROLE_SLOTS: Record<SketchRole, { kind: 'interactive_visualization' | 'visual_quiz'; position: number; materialKey: string }> = {
  exploration: { kind: 'interactive_visualization', position: 1, materialKey: 'exploration' },
  application: { kind: 'interactive_visualization', position: 2, materialKey: 'application' },
  visualChallenge: { kind: 'visual_quiz', position: 4, materialKey: 'challenge' },
};

export const sketchTaskSchema = z.string().trim().min(10).max(4_000);

export const sketchRequestSchema = z.object({
  objectiveId: z.string().uuid(),
  role: z.enum(SKETCH_ROLES),
  taskDescription: sketchTaskSchema,
});

export const keepSketchSchema = z.object({
  objectiveRevision: z.number().int().positive(),
  role: z.enum(SKETCH_ROLES),
  taskDescription: sketchTaskSchema,
  library: z.enum(['react', 'p5', 'three']),
  code: z.string().min(1).max(200_000),
  explanation: z.string().max(8_000),
  signature: z.string().regex(/^[0-9a-f]{64}$/),
});

export type SketchResult = {
  objectiveId: string;
  objectiveRevision: number;
  role: SketchRole;
  taskDescription: string;
  library: 'react' | 'p5' | 'three';
  code: string;
  explanation: string;
  signature: string;
};

/** The visual request: the material's teaching role first, then what the teacher asked for. */
export function sketchVisualTask(input: { role: SketchRole; objectiveText: string; taskDescription: string }) {
  const role = input.role === 'visualChallenge' ? materialRoles.visualChallenge : materialRoles[input.role];
  return `${role}\nObjective: ${input.objectiveText}\n\n${input.taskDescription}`;
}

/** The exact fields a sketch signature covers, in a fixed order. */
export function sketchSignatureMessage(input: {
  lessonId: string; objectiveId: string; objectiveRevision: number; role: SketchRole;
  taskDescription: string; library: string; code: string; explanation: string;
}) {
  return JSON.stringify([input.lessonId, input.objectiveId, input.objectiveRevision, input.role, input.taskDescription, input.library, input.code, input.explanation]);
}
