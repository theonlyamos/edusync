/**
 * Honest visual status for the Gemini Live tutor.
 *
 * Visual tool calls are answered right away so the tutor keeps talking, but that
 * first answer only says the visual is being prepared. Once the visual has
 * rendered (or failed), a VISUAL_STATUS message is queued and sent to the tutor
 * when nobody is speaking, so it never describes something that isn't on screen.
 */

import { formatVisualStatusMessage, type VisualStatusReport } from '@edusync/shared/visual-status';

export {
  VISUAL_PENDING_TOOL_RESPONSE,
  formatVisualStatusMessage,
  type VisualStatusReport,
} from '@edusync/shared/visual-status';

export const VISUAL_TOOL_NAMES = ['generate_visualization_description', 'request_learning_artifact'] as const;

export function isVisualToolName(name: string): boolean {
  return (VISUAL_TOOL_NAMES as readonly string[]).includes(name);
}

/** Queues status messages and sends them only while the tutor and learner are both quiet. */
export function createVisualStatusDelivery(transport: { send: (text: string) => void; isIdle: () => boolean }) {
  const MAX_QUEUED = 3;
  let queue: string[] = [];
  let active = true;
  return {
    enqueue(report: VisualStatusReport) {
      if (!active) return;
      queue.push(formatVisualStatusMessage(report));
      if (queue.length > MAX_QUEUED) queue = queue.slice(-MAX_QUEUED);
    },
    flush() {
      if (!active || queue.length === 0 || !transport.isIdle()) return;
      // Send one at a time so the tutor can react to each before the next.
      transport.send(queue[0]);
      queue = queue.slice(1);
    },
    clear() { queue = []; },
    dispose() { active = false; queue = []; },
    get size() { return queue.length; },
  };
}

export type RenderOutcome = { ok: true } | { ok: false; reason: string };

/**
 * Bridges sandbox renderer callbacks (onReady / onError) to a promise the tool
 * handler can await. Only the latest wait is live; starting a new one settles
 * the previous wait as superseded.
 */
export function createRenderWaiter(timers: {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
} = { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) }) {
  let settle: ((outcome: RenderOutcome) => void) | null = null;
  let timer: unknown = null;

  const finish = (outcome: RenderOutcome) => {
    if (!settle) return;
    const resolve = settle;
    settle = null;
    if (timer !== null) timers.clearTimeout(timer);
    timer = null;
    resolve(outcome);
  };

  return {
    wait(timeoutMs: number): Promise<RenderOutcome> {
      finish({ ok: false, reason: 'A newer visual replaced this one before it loaded' });
      return new Promise<RenderOutcome>((resolve) => {
        settle = resolve;
        timer = timers.setTimeout(() => finish({ ok: false, reason: 'The visual did not finish loading' }), timeoutMs);
      });
    },
    ready() { finish({ ok: true }); },
    failed(reason: string) { finish({ ok: false, reason }); },
    get pending() { return settle !== null; },
  };
}
