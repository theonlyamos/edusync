import { describe, expect, it } from 'vitest';
import { acceptedCreativeConcepts, artifactMaterialRole, bundleRequestSchema, creativeConceptPrompt, creativeConceptSchema, materialRoles } from '../creative-concept';
import { buildArtifactInsert, generateArtifactPayload, type ContentJobRecord } from '../jobs';

const concept = 'Rescue a stranded rover: compare force arrows, test a ramp, and plan a safe route.';
const job: ContentJobRecord = {
  id: 'job', lessonId: 'lesson', objectiveId: 'objective', requestedBy: 'teacher', jobType: 'generate_interactive', attemptCount: 1, maxAttempts: 3,
  input: { lessonTitle: 'Motion', subject: 'Science', gradeLevel: '6', objectiveText: 'Explain forces.', objectiveRevision: 2, position: 1, creativeConcept: concept, visualInstructions: 'Use SI units.', feedback: 'Enlarge all labels.' },
};

describe('accepted creative concepts', () => {
  it('validates trimmed bounds and requires a revision when accepting a plan', () => {
    expect(creativeConceptSchema.parse(`  ${concept}  `)).toBe(concept);
    expect(creativeConceptSchema.safeParse('x'.repeat(19)).success).toBe(false);
    expect(creativeConceptSchema.safeParse('x'.repeat(20)).success).toBe(true);
    expect(creativeConceptSchema.safeParse('x'.repeat(4000)).success).toBe(true);
    expect(creativeConceptSchema.safeParse('x'.repeat(4001)).success).toBe(false);
    expect(bundleRequestSchema.safeParse({ creativeConcept: concept }).success).toBe(false);
    expect(bundleRequestSchema.safeParse({ creativeConcept: concept, objectiveRevision: 2 }).success).toBe(true);
    expect(bundleRequestSchema.safeParse({}).success).toBe(true);
  });

  it('plans all five distinct roles with teacher constraints and latest guidance', () => {
    const prompt = creativeConceptPrompt({ ...job.input, guidance: 'Use a desert setting.', previousConcept: 'An earlier boat idea.' });
    for (const role of Object.values(materialRoles)) expect(prompt).toContain(role);
    expect(prompt).toContain('Use SI units.');
    expect(prompt).toContain('Use a desert setting.');
    expect(prompt).toContain('An earlier boat idea.');
    expect(prompt).toContain('highest priority');
    expect(prompt).toContain('narrative and visual language');
  });

  it('sends the complete concept and a distinct standalone role to every generator and saves the concept', async () => {
    const prompts: string[] = [];
    const types = ['generate_image', 'generate_interactive', 'generate_interactive', 'generate_structured_quiz', 'generate_visual_quiz'] as const;
    for (const [position, jobType] of types.entries()) {
      const current = { ...job, jobType, input: { ...job.input, position } };
      const payload = await generateArtifactPayload(current, {
        visualize: async (prompt) => { prompts.push(prompt); return { library: 'react', code: 'function App() {}', explanation: 'Explore forces.' }; },
        generateImage: async (prompt) => { prompts.push(prompt); return { assetId: '00000000-0000-4000-8000-000000000001', altText: 'Forces', caption: 'Rover rescue' }; },
        generateText: async (_system, prompt) => {
          prompts.push(prompt);
          return JSON.stringify({ title: 'Forces', questions: Array.from({ length: 5 }, (_, i) => ({ id: `q${i}`, type: 'true_false', prompt: 'Forces change motion.', correctAnswer: true, explanation: 'An unbalanced force accelerates.', points: 1 })) });
        },
      });
      expect(buildArtifactInsert(current, payload).generation_metadata.creativeConcept).toBe(concept);
      expect(buildArtifactInsert(current, payload).generation_metadata.materialRole).toBe(Object.keys(materialRoles)[position]);
    }
    prompts.forEach((prompt, index) => {
      expect(prompt).toContain(concept);
      expect(prompt).toContain(Object.values(materialRoles)[index]);
      expect(prompt).toContain('cannot see the other generated materials');
      expect(prompt).toContain('Use SI units.');
      expect(prompt).toContain('Enlarge all labels.');
      expect(prompt).toContain('highest priority');
    });
  });

  it('keeps legacy Apply at position 1 and distinguishes introduction-era Explore at the same position', async () => {
    const legacy = { kind: 'interactive_visualization', position: 1, payload: { taskDescription: 'Create a focused interactive visualization that lets the learner manipulate one important relationship and observe cause and effect.' } };
    expect(artifactMaterialRole(legacy)).toBe('application');
    const modern = { ...legacy, payload: { taskDescription: `${legacy.payload.taskDescription} Introduce the relationship through a concrete example.` } };
    expect(artifactMaterialRole(modern)).toBe('exploration');
    expect(artifactMaterialRole({ ...modern, generation_metadata: { materialRole: 'application' } })).toBe('application');
    let prompt = '';
    const regenerated = { ...job, input: { ...job.input, materialRole: 'application' as const, position: 1 } };
    const payload = await generateArtifactPayload(regenerated, {
      visualize: async (task) => { prompt = task; return { library: 'react', code: 'function App() {}', explanation: 'Apply forces.' }; },
      generateText: async () => '', generateImage: async () => { throw new Error('not used'); },
    });
    expect(prompt).toContain(`Assigned material role: ${materialRoles.application}`);
    expect(prompt).toContain('emphasize applying the relationship.');
    expect(buildArtifactInsert(regenerated, payload).generation_metadata.materialRole).toBe('application');
  });

  it('restores the newest valid accepted concept only for current objectives and revisions', () => {
    expect(acceptedCreativeConcepts([{ id: 'objective', revision: 2 }], [
      { objective_id: 'objective', input: { objectiveRevision: 1, creativeConcept: 'Outdated plan for the rover.' } },
      { objective_id: 'objective', input: { objectiveRevision: 2, creativeConcept: '' } },
      { objective_id: 'objective', input: { objectiveRevision: 2, creativeConcept: concept } },
      { objective_id: 'objective', input: { objectiveRevision: 2, creativeConcept: 'Older plan for the same revision.' } },
      { objective_id: 'archived', input: { objectiveRevision: 2, creativeConcept: concept } },
    ])).toEqual({ objective: { revision: 2, concept } });
  });
});
