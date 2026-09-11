import { beforeEach, describe, expect, it, vi } from 'vitest';

// Exercise async hook transitions without adding a DOM or renderer dependency.
const hooks = vi.hoisted(() => ({ slots: [] as unknown[], index: 0 }));
vi.mock('react', () => ({
  useState(initial: unknown) {
    const index = hooks.index++;
    if (!(index in hooks.slots)) hooks.slots[index] = initial;
    return [hooks.slots[index], (value: unknown) => {
      hooks.slots[index] = typeof value === 'function' ? value(hooks.slots[index]) : value;
    }];
  },
  useRef(initial: unknown) {
    const index = hooks.index++;
    if (!(index in hooks.slots)) hooks.slots[index] = { current: initial };
    return hooks.slots[index];
  },
  useCallback: (callback: unknown) => callback,
  useMemo: (callback: () => unknown) => callback(),
  useEffect: () => {},
}));

import { useObjectiveLearning } from '../useObjectiveLearning';

const introduction = (id: string) => ({
  instanceId: `intro-${id}`, source: 'teacher_approved', exhausted: false,
  artifact: { id: `image-${id}`, kind: 'generated_image', payload: { introductionFor: 'objective' } },
});
const runResponse = (objectiveId: string, intro: unknown = introduction(objectiveId)) => Response.json({
  run: { id: 'run', active_objective_id: objectiveId },
  objectives: [{ id: objectiveId, text: objectiveId, position: 0, revision: 1 }], introduction: intro,
});
function RenderHook(lessonId = 'lesson') {
  hooks.index = 0;
  return useObjectiveLearning({ lessonId, autoStart: false });
}

beforeEach(() => {
  hooks.slots = [];
  hooks.index = 0;
  vi.stubGlobal('fetch', vi.fn());
});

describe('objective introduction startup', () => {
  it('starts with the approved introduction and appends later activities after it', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(runResponse('one'));
    await RenderHook().initialize();
    expect(RenderHook().artifacts).toEqual([introduction('one')]);
    const activity = { ...introduction('activity'), instanceId: 'activity' };
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(activity));
    await RenderHook().requestArtifact('visualization', 'request');
    expect(RenderHook().artifacts.map((item) => item.instanceId)).toEqual(['intro-one', 'activity']);
  });

  it('discards an old activity when switching and installs the new introduction first', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(runResponse('one'));
    await RenderHook().initialize();
    let finishActivity!: (response: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise((resolve) => { finishActivity = resolve; }));
    const oldActivity = RenderHook().requestArtifact('visualization', 'old-request');
    const rejected = expect(oldActivity).rejects.toThrow('The active objective has changed');
    let finishSwitch!: (response: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise((resolve) => { finishSwitch = resolve; }));
    const switchObjective = RenderHook().selectObjective('two');
    expect(RenderHook().artifacts).toEqual([]);
    await expect(RenderHook().requestArtifact('quiz')).rejects.toThrow('not ready');
    finishSwitch(runResponse('two'));
    await expect(switchObjective).resolves.toBe(true);
    finishActivity(Response.json(introduction('stale')));
    await rejected;
    expect(RenderHook().artifacts).toEqual([introduction('two')]);
    expect(RenderHook().error).toBeNull();
  });

  it('supports legacy runs and discards a switch response after another lesson starts', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(runResponse('legacy', null));
    await RenderHook().initialize();
    expect(RenderHook().artifacts).toEqual([]);
    let finishSwitch!: (response: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise((resolve) => { finishSwitch = resolve; }));
    const switchObjective = RenderHook().selectObjective('stale');
    vi.mocked(fetch).mockResolvedValueOnce(runResponse('new-lesson'));
    await RenderHook('other-lesson').initialize();
    finishSwitch(runResponse('stale'));
    await expect(switchObjective).resolves.toBe(false);
    expect(RenderHook('other-lesson').artifacts).toEqual([introduction('new-lesson')]);
  });

  it('rejects old lesson callbacks and stops activities after a failed objective switch', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(runResponse('one'));
    await RenderHook().initialize();
    const oldController = RenderHook();
    vi.mocked(fetch).mockResolvedValueOnce(runResponse('two'));
    await RenderHook('other-lesson').initialize();
    await expect(oldController.requestArtifact('quiz')).rejects.toThrow('not ready');
    await expect(oldController.selectObjective('stale')).resolves.toBe(false);
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ error: 'Switch unavailable' }, { status: 503 }));
    await expect(RenderHook('other-lesson').selectObjective('three')).resolves.toBe(false);
    expect(RenderHook('other-lesson').runId).toBeNull();
    expect(RenderHook('other-lesson').artifacts).toEqual([]);
    expect(RenderHook('other-lesson').error).toBe('Switch unavailable');
  });
});
