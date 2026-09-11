import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement, ReactNode } from 'react';
import type { LearningArtifactAttachment } from '@/components/students/study-companion/types';

const hooks = vi.hoisted(() => ({ slots: [] as unknown[], index: 0 }));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState(initial: unknown) {
    const index = hooks.index++;
    if (!(index in hooks.slots)) hooks.slots[index] = initial;
    return [hooks.slots[index], (value: unknown) => { hooks.slots[index] = typeof value === 'function' ? value(hooks.slots[index]) : value; }];
  },
  useRef: () => ({ current: false }),
  useEffect: () => {},
  useMemo: (fn: () => unknown) => fn(),
  useCallback: (fn: unknown) => fn,
}));
vi.mock('@/components/students/study-companion/InteractiveElementCard', () => ({ InteractiveElementCard: () => null }));
import { LearningArtifactCard } from '@/components/students/study-companion/LearningArtifactCard';
import { QUIZ_FEEDBACK_EVENT } from '../quiz-feedback-delivery';

const attachment = {
  instanceId: 'instance', source: 'teacher_approved', exhausted: false,
  artifact: { id: 'quiz', kind: 'structured_quiz', payload: { kind: 'structured_quiz', title: 'Forces', questions: [{ id: 'q1', type: 'true_false', prompt: 'Balanced forces always mean rest.', points: 1 }] } },
} as LearningArtifactAttachment;
type Element = ReactElement<{ children?: ReactNode; onClick?: () => Promise<void> | void; role?: string }>;
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== 'object' || !('props' in node)) return [];
  const element = node as Element;
  return [element, ...elements(element.props.children)];
}
function render() { hooks.index = 0; return elements(LearningArtifactCard({ attachment })); }
function button(label: string) { return render().find(element => element.props.onClick && (Array.isArray(element.props.children) ? element.props.children.includes(label) : element.props.children === label))!; }

beforeEach(() => {
  hooks.slots = []; hooks.index = 0;
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('fetch', vi.fn());
});

describe('confirmed quiz result notification', () => {
  it('notifies only after the server saves the quiz and carries scope rather than a client score', async () => {
    const received: unknown[] = [];
    window.addEventListener(QUIZ_FEEDBACK_EVENT, event => received.push((event as CustomEvent).detail));
    button('False').props.onClick?.();
    const scope = { runId: 'run', objectiveId: 'objective', objectiveRevision: 2 };
    let finish!: (response: Response) => void;
    vi.mocked(fetch).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const submitting = button('Check my answers').props.onClick?.();
    expect(received).toEqual([]);
    finish(Response.json({ percentage: 100, results: [], feedbackScope: scope }));
    await submitting;
    expect(received).toEqual([scope]);
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))).toEqual({ answers: { q1: false } });
  });

  it('shows failed saves without notifying the tutor and allows another submission', async () => {
    const listener = vi.fn(); window.addEventListener(QUIZ_FEEDBACK_EVENT, listener);
    button('True').props.onClick?.();
    vi.mocked(fetch).mockResolvedValue(Response.json({ error: 'Try again later' }, { status: 503 }));
    await button('Check my answers').props.onClick?.();
    expect(listener).not.toHaveBeenCalled();
    expect(render().find(element => element.props.role === 'alert')?.props.children).toBe('Try again later');
    expect(button('Check my answers')).toBeDefined();
  });
});
