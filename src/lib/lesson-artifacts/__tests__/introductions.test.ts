import { describe, expect, it, vi } from 'vitest';
import { authoringUpdateSchema, regenerationSchema } from '../authoring';
import { buildPublicationManifest, type LessonArtifactRecord } from '../domain';
import { missingPublicationIntroductions, publicationArtifactIds } from '../introductions';
import { generateArtifactPayload, type ContentJobRecord } from '../jobs';
import { selectNextPublishedArtifact } from '../resolver';
import { normalizePublishedObjectives } from '../student-learning';

const lesson = { id: 'lesson', title: 'Fractions', subject: 'Math', gradeLevel: '4', content: null, visualRevision: 2 };
const objective = { id: 'objective', text: 'Compare halves', revision: 3, position: 0 };
function image(scope: 'lesson' | 'objective', overrides: Partial<LessonArtifactRecord> = {}): LessonArtifactRecord {
  return {
    id: scope, lessonId: lesson.id, objectiveId: scope === 'lesson' ? null : objective.id,
    objectiveRevision: scope === 'lesson' ? 2 : 3, seriesId: scope, version: 1, kind: 'generated_image',
    status: 'approved', position: 0, source: 'ai_generated',
    payload: { kind: 'generated_image', introductionFor: scope, assetId: '00000000-0000-4000-8000-000000000001', altText: 'Halves', caption: 'Two equal parts', aspectRatio: '4:3' }, ...overrides,
  };
}
const manifest = (artifacts: LessonArtifactRecord[]) => buildPublicationManifest({ lesson, objectives: [objective], artifacts });

describe('required introduction images', () => {
  it('pins lesson and objective introductions and reports all missing scopes', () => {
    expect(missingPublicationIntroductions(manifest([]))).toEqual(['lesson introduction', 'objective 1 introduction']);
    const ready = manifest([image('lesson'), image('objective')]);
    expect(missingPublicationIntroductions(ready)).toEqual([]);
    expect(ready.lesson.introductionArtifactId).toBe('lesson');
    expect(ready.objectives[0].introductionArtifactId).toBe('objective');
    expect(publicationArtifactIds(ready)).toEqual(['lesson', 'objective']);
  });
  it('rejects draft, wrong revision, wrong lesson and unmarked legacy images', () => {
    const old = image('objective');
    if (old.payload.kind === 'generated_image') delete old.payload.introductionFor;
    expect(missingPublicationIntroductions(manifest([
      image('lesson', { status: 'draft' }), image('lesson', { objectiveRevision: 1 }),
      image('lesson', { lessonId: 'another' }), image('objective', { objectiveRevision: 2 }), old,
    ]))).toHaveLength(2);
  });
  it('keeps an approved introduction while a replacement is still a draft', () => {
    const ready = manifest([image('lesson'), image('objective'), image('objective', { id: 'draft', version: 2, status: 'draft' })]);
    expect(ready.objectives[0].introductionArtifactId).toBe('objective');
  });
  it('does not return the introduction again as a next activity', () => {
    expect(selectNextPublishedArtifact({ artifacts: [image('objective')], publishedArtifactIds: new Set(['objective']), consumedArtifactIds: new Set(), kind: 'visualization' })).toBeUndefined();
  });
  it('normalizes new introduction IDs while keeping old publications readable', () => {
    expect(normalizePublishedObjectives([objective])).toEqual([objective]);
    expect(normalizePublishedObjectives([{ ...objective, introductionArtifactId: 'image', artifactIds: ['image'] }])?.[0].introductionArtifactId).toBe('image');
    expect(normalizePublishedObjectives([{ ...objective, introductionArtifactId: 'unpublished', artifactIds: [] }])).toBeNull();
  });
});

describe('teacher visual direction', () => {
  it('preserves explicit visual instructions and validates request limits', () => {
    const input = authoringUpdateSchema.parse({ ...lesson, visualInstructions: ' Use labeled pizza diagrams. ', objectives: [{ text: objective.text, visualInstructions: ' Let learners drag halves. ' }] });
    expect(input.visualInstructions).toBe('Use labeled pizza diagrams.');
    expect(input.objectives[0].visualInstructions).toBe('Let learners drag halves.');
    expect(regenerationSchema.safeParse({ feedback: 'x'.repeat(4001) }).success).toBe(false);
  });
  it('includes diagrams, labels, examples, interactions and revision feedback in the generation prompt', async () => {
    const visualize = vi.fn(async (_prompt: string) => ({ library: 'react' as const, code: 'function App() {}', explanation: 'Compare halves.' }));
    const generateImage = vi.fn(async (_prompt: string) => ({ assetId: '00000000-0000-4000-8000-000000000001', altText: 'Fractions', caption: 'Two halves' }));
    const job: ContentJobRecord = { id: 'job', lessonId: lesson.id, objectiveId: objective.id, requestedBy: 'teacher', jobType: 'generate_interactive', attemptCount: 1, maxAttempts: 3, input: {
      lessonTitle: lesson.title, subject: lesson.subject, gradeLevel: lesson.gradeLevel, objectiveText: objective.text, objectiveRevision: objective.revision, position: 1,
      visualInstructions: 'Draw a pizza diagram labeled one half.', objectiveVisualInstructions: 'Use two pizzas; drag each half.', feedback: 'Make labels larger.',
    } };
    const deps = { visualize, generateImage, generateText: async () => '' };
    await generateArtifactPayload(job, deps);
    expect(visualize.mock.calls[0][0]).toContain('Draw a pizza diagram labeled one half.');
    expect(visualize.mock.calls[0][0]).toContain('Use two pizzas; drag each half.');
    expect(visualize.mock.calls[0][0]).toContain('Make labels larger.');
    const generated = await generateArtifactPayload({ ...job, objectiveId: null, jobType: 'generate_image' }, deps);
    expect(generated).toMatchObject({ kind: 'generated_image', introductionFor: 'lesson' });
    expect(generateImage.mock.calls[0][0]).toContain('overview of the entire lesson');
    expect(generateImage.mock.calls[0][0]).toContain('readable instructional labels');
  });
});
