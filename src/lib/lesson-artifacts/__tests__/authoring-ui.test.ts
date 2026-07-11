import { describe, expect, it } from 'vitest';

import {
  isArtifactActionBusy,
  mergeGeneratedLessonDraft,
  shouldApplyRemoteObjectives,
  summarizeContentJobs,
} from '../authoring-ui';

describe('Objective Studio state helpers', () => {
  it('tracks the active action separately for each artifact', () => {
    const busy = { artifactId: 'artifact-1', action: 'regenerate' } as const;

    expect(isArtifactActionBusy(busy, 'artifact-1', 'regenerate')).toBe(true);
    expect(isArtifactActionBusy(busy, 'artifact-1', 'approve')).toBe(false);
    expect(isArtifactActionBusy(busy, 'artifact-2', 'regenerate')).toBe(false);
  });

  it('does not overwrite dirty local objectives during background refreshes', () => {
    expect(shouldApplyRemoteObjectives({ dirty: true, force: false })).toBe(false);
    expect(shouldApplyRemoteObjectives({ dirty: true, force: true })).toBe(true);
    expect(shouldApplyRemoteObjectives({ dirty: false, force: false })).toBe(true);
  });

  it('distinguishes successful, failed, and active jobs', () => {
    expect(summarizeContentJobs([
      { status: 'succeeded' },
      { status: 'failed' },
      { status: 'cancelled' },
      { status: 'running' },
    ])).toEqual({ total: 4, done: 3, succeeded: 1, failed: 1, cancelled: 1, active: 1 });
  });

  it('preserves manual fields unless replacement was explicitly confirmed', () => {
    const generated = { title: 'Generated title', objectives: ['Generated objective'], content: 'Generated content' };
    expect(mergeGeneratedLessonDraft({
      current: { title: 'Manual title', objectives: ['Manual objective'], content: '' },
      generated,
      replaceExisting: false,
    })).toEqual({ title: 'Manual title', objectives: ['Manual objective'], content: 'Generated content' });
    expect(mergeGeneratedLessonDraft({
      current: { title: 'Manual title', objectives: ['Manual objective'], content: 'Manual content' },
      generated,
      replaceExisting: true,
    })).toEqual({ title: 'Manual title', objectives: ['Generated objective'], content: 'Generated content' });
  });
});
