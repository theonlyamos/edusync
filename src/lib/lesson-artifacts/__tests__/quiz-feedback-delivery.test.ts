import { describe, expect, it, vi } from 'vitest';
import { createQuizFeedbackDelivery, createTutorTurnTracker } from '../quiz-feedback-delivery';
import type { QuizFeedbackSnapshot } from '../quiz-feedback';

const scope = { runId: 'run', objectiveId: 'objective', objectiveRevision: 2 };
const snapshot = (id = 'attempt'): QuizFeedbackSnapshot => ({ ...scope, eventIds: [id], context: `Feedback ${id}` });

describe('quiz feedback delivery', () => {
  it('waits for a delayed response to typed input and feedback itself, then the idle boundary', async () => {
    let time = 0;
    const turns = createTutorTurnTracker(() => time);
    const send = vi.fn(() => turns.sent());
    const queue = createQuizFeedbackDelivery(scope, { load: async () => snapshot(), send, isIdle: turns.isIdle });
    await queue.refresh();
    turns.sent(); // Learner typed a question; no model chunk has arrived yet.
    time = 5000; queue.flush(); expect(send).not.toHaveBeenCalled();
    turns.received({ serverContent: { modelTurn: {} } }); queue.flush(); expect(send).not.toHaveBeenCalled();
    turns.received({ serverContent: { turnComplete: true } });
    time += 799; queue.flush(); expect(send).not.toHaveBeenCalled();
    time += 1; queue.flush(); expect(send).toHaveBeenCalledOnce();
    time += 5000; expect(turns.isIdle()).toBe(false); // Feedback response has not arrived.
    turns.received({ serverContent: { modelTurn: {} } });
    turns.received({ serverContent: { interrupted: true } }); time += 800;
    expect(turns.isIdle()).toBe(true);
    turns.activity(); expect(turns.isIdle()).toBe(false);
  });

  it('recovers from ignored microphone input without clearing a pending barge-in on interruption', () => {
    let time = 0;
    const turns = createTutorTurnTracker(() => time);
    turns.sent(); time = 9999; expect(turns.isIdle()).toBe(false);
    time = 10000; expect(turns.isIdle()).toBe(true);
    turns.received({ serverContent: { modelTurn: {} } });
    turns.sent(); // Learner interrupts the model with a new question.
    turns.received({ serverContent: { interrupted: true } });
    turns.received({ serverContent: { turnComplete: true } }); // Completion belongs to the interrupted response.
    time += 800; expect(turns.isIdle()).toBe(false);
    turns.received({ serverContent: { modelTurn: {} } });
    turns.received({ serverContent: { turnComplete: true } });
    time += 800; expect(turns.isIdle()).toBe(true);
    turns.sent(); turns.received({ serverContent: { turnComplete: true } });
    time += 800; expect(turns.isIdle()).toBe(true);
  });

  it('sends a new objective scope notice once even when it has no quiz results', async () => {
    const nextScope = { ...scope, objectiveId: 'next' };
    const send = vi.fn();
    const queue = createQuizFeedbackDelivery(nextScope, { load: async () => ({ ...nextScope, eventIds: [], context: 'Focus on objective next; no quiz results yet.' }), send, isIdle: () => true });
    await queue.refresh(); queue.flush(); await queue.refresh(); queue.flush();
    expect(send).toHaveBeenCalledExactlyOnceWith('Focus on objective next; no quiz results yet.');
  });
  it('waits for idle, sends once, coalesces newer results, and restores after reconnect', async () => {
    let idle = false;
    const load = vi.fn(async () => snapshot());
    const send = vi.fn();
    const transport = { load, send, isIdle: () => idle };
    const queue = createQuizFeedbackDelivery(scope, transport);
    await queue.refresh(); queue.flush();
    expect(send).not.toHaveBeenCalled();
    load.mockResolvedValue(snapshot('retry'));
    await queue.refresh(); idle = true; queue.flush();
    expect(send).toHaveBeenCalledExactlyOnceWith('Feedback retry');
    await queue.refresh(); queue.flush();
    expect(send).toHaveBeenCalledTimes(1);
    queue.dispose();
    const reconnected = createQuizFeedbackDelivery(scope, transport);
    await reconnected.refresh(); reconnected.flush();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('drops out-of-order requests, other objectives/revisions, and disconnected results', async () => {
    let finish!: (snapshot: QuizFeedbackSnapshot) => void;
    const load = vi.fn(() => new Promise<QuizFeedbackSnapshot>(resolve => { finish = resolve; }));
    const send = vi.fn();
    const queue = createQuizFeedbackDelivery(scope, { load, send, isIdle: () => true });
    const oldRequest = queue.refresh();
    load.mockResolvedValue(snapshot('new'));
    await queue.refresh(); finish(snapshot('old')); await oldRequest; queue.flush();
    expect(send).toHaveBeenCalledExactlyOnceWith('Feedback new');
    for (const changed of [{ runId: 'other' }, { objectiveId: 'other' }, { objectiveRevision: 3 }]) {
      load.mockResolvedValue({ ...snapshot('stale'), ...changed });
      await queue.refresh(); queue.flush();
    }
    load.mockResolvedValue(snapshot('late'));
    const late = queue.refresh(); queue.dispose(); await late; queue.flush();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('retains a result after transport failure and never sends empty evidence', async () => {
    const load = vi.fn(async () => snapshot());
    const send = vi.fn().mockImplementationOnce(() => { throw new Error('socket closed'); });
    const queue = createQuizFeedbackDelivery(scope, { load, send, isIdle: () => true });
    await queue.refresh();
    expect(() => queue.flush()).toThrow('socket closed');
    queue.flush(); expect(send).toHaveBeenCalledTimes(2);
    load.mockResolvedValue({ ...snapshot(), eventIds: [], context: '' });
    await queue.refresh(); queue.flush(); expect(send).toHaveBeenCalledTimes(2);
  });
});
