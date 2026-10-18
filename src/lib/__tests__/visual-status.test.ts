import { describe, expect, it, vi } from 'vitest';
import {
  createRenderWaiter,
  createVisualStatusDelivery,
  formatVisualStatusMessage,
  isVisualToolName,
  reportElementRender,
  waitForElementRender,
} from '../visual-status';

describe('formatVisualStatusMessage', () => {
  it('reports what is on screen for a ready visual', () => {
    const text = formatVisualStatusMessage({ status: 'ready', explanation: 'A slider changes the launch angle.', taskDescription: 'projectile demo' });
    expect(text.startsWith('VISUAL_STATUS ')).toBe(true);
    expect(JSON.parse(text.slice('VISUAL_STATUS '.length))).toEqual({
      status: 'ready',
      requested: 'projectile demo',
      onScreen: 'A slider changes the launch angle.',
    });
  });

  it('always includes a reason for a failed visual and clips long fields', () => {
    const failed = JSON.parse(formatVisualStatusMessage({ status: 'failed' }).slice(14));
    expect(failed).toEqual({ status: 'failed', reason: 'unknown error' });
    const long = JSON.parse(formatVisualStatusMessage({ status: 'failed', reason: 'x'.repeat(2000) }).slice(14));
    expect(long.reason.length).toBeLessThanOrEqual(601);
  });
});

describe('createVisualStatusDelivery', () => {
  it('waits for idle and sends one message per flush', () => {
    let idle = false;
    const send = vi.fn();
    const delivery = createVisualStatusDelivery({ send, isIdle: () => idle });
    delivery.enqueue({ status: 'ready', explanation: 'one' });
    delivery.enqueue({ status: 'failed', reason: 'two' });
    delivery.flush();
    expect(send).not.toHaveBeenCalled();
    idle = true;
    delivery.flush();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toContain('"one"');
    delivery.flush();
    expect(send.mock.calls[1][0]).toContain('"two"');
    expect(delivery.size).toBe(0);
  });

  it('keeps only the newest few messages and stops after dispose', () => {
    const send = vi.fn();
    const delivery = createVisualStatusDelivery({ send, isIdle: () => true });
    for (let i = 0; i < 5; i++) delivery.enqueue({ status: 'ready', explanation: `v${i}` });
    expect(delivery.size).toBe(3);
    delivery.dispose();
    delivery.flush();
    expect(send).not.toHaveBeenCalled();
  });
});

describe('createRenderWaiter', () => {
  it('resolves ready, failure and timeout outcomes', async () => {
    vi.useFakeTimers();
    try {
      const waiter = createRenderWaiter();
      const ready = waiter.wait(1000);
      waiter.ready();
      await expect(ready).resolves.toEqual({ ok: true });

      const failed = waiter.wait(1000);
      waiter.failed('boom');
      await expect(failed).resolves.toEqual({ ok: false, reason: 'boom' });

      const timedOut = waiter.wait(1000);
      vi.advanceTimersByTime(1000);
      await expect(timedOut).resolves.toMatchObject({ ok: false });
      expect(waiter.pending).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('settles an older wait when a newer visual starts', async () => {
    const waiter = createRenderWaiter();
    const first = waiter.wait(10_000);
    const second = waiter.wait(10_000);
    await expect(first).resolves.toMatchObject({ ok: false });
    waiter.ready();
    await expect(second).resolves.toEqual({ ok: true });
  });

  it('ignores signals when nothing is waiting', () => {
    const waiter = createRenderWaiter();
    expect(() => { waiter.ready(); waiter.failed('late'); }).not.toThrow();
  });
});

describe('isVisualToolName', () => {
  it('matches only visual tools', () => {
    expect(isVisualToolName('generate_visualization_description')).toBe(true);
    expect(isVisualToolName('request_learning_artifact')).toBe(true);
    expect(isVisualToolName('set_topic')).toBe(false);
  });
});

describe('waitForElementRender', () => {
  it('resolves with the card render outcome for that element only', async () => {
    const rendered = waitForElementRender('element-a', 30_000);
    reportElementRender('element-b', { ok: true });
    reportElementRender('element-a', { ok: false, reason: 'Syntax error in generated code' });
    reportElementRender('element-a', { ok: true });
    await expect(rendered).resolves.toEqual({ ok: false, reason: 'Syntax error in generated code' });
  });

  it('fails when the card never reports or a newer visual replaces it', async () => {
    vi.useFakeTimers();
    try {
      const timedOut = waitForElementRender('slow-element', 1_000);
      vi.advanceTimersByTime(1_000);
      await expect(timedOut).resolves.toEqual({ ok: false, reason: 'The visual did not finish loading' });
      const controller = new AbortController();
      const replaced = waitForElementRender('replaced-element', 1_000, controller.signal);
      controller.abort();
      await expect(replaced).resolves.toMatchObject({ ok: false });
    } finally {
      vi.useRealTimers();
    }
  });
});
