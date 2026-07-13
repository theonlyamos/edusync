import { describe, expect, it } from 'vitest';

import {
  appendUniqueArtifact,
  buildObjectiveTutorPromptContext,
  createAsyncRequestDeduper,
  createLearningScopeGuard,
  normalizeRequestedArtifactKind,
} from '../objective-learning-controller';

describe('objective learning controller', () => {
  it('shares an in-flight request with duplicate callers and releases it after completion', async () => {
    const deduper = createAsyncRequestDeduper();
    let calls = 0;
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const operation = async () => {
      calls += 1;
      await pending;
      return { value: calls };
    };

    const first = deduper.run('artifact-call-1', operation);
    const duplicate = deduper.run('artifact-call-1', operation);
    expect(duplicate).toBe(first);
    expect(calls).toBe(1);

    release();
    await expect(first).resolves.toEqual({ value: 1 });
    await deduper.run('artifact-call-1', operation);
    expect(calls).toBe(2);
  });

  it('does not append the same resolved artifact instance twice', () => {
    const artifact = { instanceId: 'instance-1', source: 'teacher_approved' as const };
    expect(appendUniqueArtifact([artifact], artifact)).toEqual([artifact]);
    expect(appendUniqueArtifact([], artifact)).toEqual([artifact]);
  });

  it('invalidates stale learning requests when the lesson scope changes', () => {
    const guard = createLearningScopeGuard();
    const firstLesson = guard.begin('lesson-1:tutor');
    const secondLesson = guard.begin('lesson-2:tutor');

    expect(guard.isCurrent(firstLesson)).toBe(false);
    expect(guard.isCurrent(secondLesson)).toBe(true);
    guard.clear();
    expect(guard.isCurrent(secondLesson)).toBe(false);
  });

  it('focuses the voice tutor on one objective and names the approved-first tool', () => {
    const context = buildObjectiveTutorPromptContext({
      lessonTitle: 'Forces and Motion',
      subject: 'Physics',
      gradeLevel: 'JHS 1',
      objectiveText: 'Calculate the net force acting on an object.',
    });

    expect(context).toContain('Active objective: Calculate the net force acting on an object.');
    expect(context).toContain('request_learning_artifact');
    expect(normalizeRequestedArtifactKind('quiz')).toBe('quiz');
    expect(normalizeRequestedArtifactKind('diagram')).toBe('visualization');
  });
});
