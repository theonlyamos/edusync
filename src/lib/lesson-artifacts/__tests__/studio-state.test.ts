import { describe, expect, it } from 'vitest';
import { getStudioMaterials, type StudioArtifact } from '../studio-state';

function artifact(overrides: Partial<StudioArtifact> = {}): StudioArtifact {
  return { id: 'intro', objective_id: 'objective', objective_revision: 2, series_id: 'intro', version: 1, position: 0,
    kind: 'generated_image', status: 'approved', created_at: '2026-09-11T00:00:00Z',
    payload: { kind: 'generated_image', introductionFor: 'objective', assetId: 'asset', altText: 'Diagram', caption: 'Caption', aspectRatio: '4:3' }, ...overrides };
}

describe('focused Studio materials', () => {
  it('keeps all five review steps before any generation', () => {
    expect(getStudioMaterials([], 'objective', 2).map(item => item.key)).toEqual(['introduction', 'exploration', 'application', 'knowledge', 'challenge']);
  });
  it('shows the latest version but retains approval of a current previous version', () => {
    const steps = getStudioMaterials([artifact(), artifact({ id: 'replacement', version: 2, status: 'draft' })], 'objective', 2);
    expect(steps[0].artifacts.map(item => item.id)).toEqual(['replacement']);
    expect(steps[0].approved).toBe(true);
    expect(getStudioMaterials([artifact()], 'objective', 3)[0].approved).toBe(false);
  });
  it('separates repeated bundles by role without losing earlier series or teacher media', () => {
    const interactive = (id: string, position: number) => artifact({ id, series_id: id, position, generation_metadata: { materialRole: position === 1 ? 'exploration' : 'application' }, kind: 'interactive_visualization', payload: { kind: 'interactive_visualization', library: 'react', code: 'function App(){}', explanation: 'Explore', taskDescription: 'Explore' } });
    const steps = getStudioMaterials([artifact(), interactive('explore', 1), interactive('apply', 2), interactive('explore-again', 1),
      artifact({ id: 'other-objective', objective_id: 'other' }),
      artifact({ id: 'upload', series_id: 'upload', kind: 'uploaded_media', payload: { kind: 'uploaded_media', assetId: 'asset', title: 'Notes', mimeType: 'text/plain', originalFilename: 'notes.txt' } }),
    ], 'objective', 2);
    expect(steps[1].artifacts).toHaveLength(2);
    expect(steps[2].artifacts.map(item => item.id)).toEqual(['apply']);
    expect(steps.at(-1)?.key).toBe('media');
    expect(steps[0].artifacts).toHaveLength(1);
    expect(getStudioMaterials([interactive('application-first', 2)], 'objective', 2)[2].artifacts).toHaveLength(1);
    const mixed = getStudioMaterials([interactive('new-explore', 1), interactive('new-apply', 2),
      { ...interactive('old-explore', 0), generation_metadata: null },
      { ...interactive('old-apply', 1), generation_metadata: null },
    ], 'objective', 2);
    expect(mixed[1].artifacts.map(item => item.id)).toEqual(['new-explore', 'old-explore']);
    expect(mixed[2].artifacts.map(item => item.id)).toEqual(['new-apply', 'old-apply']);
  });
  it('does not treat legacy illustrations as approved introductions', () => {
    const old = artifact();
    if (old.payload.kind === 'generated_image') delete old.payload.introductionFor;
    const step = getStudioMaterials([old], 'objective', 2)[0];
    expect(step.artifacts).toHaveLength(1);
    expect(step.approved).toBe(false);
  });
});
