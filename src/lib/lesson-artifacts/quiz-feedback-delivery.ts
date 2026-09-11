import type { QuizFeedbackScope, QuizFeedbackSnapshot } from './quiz-feedback';

export const QUIZ_FEEDBACK_EVENT = 'learning-quiz-submitted';

// Include the gap before a response's first chunk, not only audible model speech.
export function createTutorTurnTracker(now = Date.now) {
  let modelActive = false;
  let interruptedTurn = false;
  let inputPendingUntil = 0;
  let lastActivity = now();
  return {
    // Local VAD and proactive audio can produce input without any server response.
    sent() { inputPendingUntil = now() + 10_000; lastActivity = now(); },
    activity() { lastActivity = now(); },
    received(message: { serverContent?: { modelTurn?: unknown; turnComplete?: boolean; interrupted?: boolean }; toolCall?: unknown }) {
      if (message.serverContent || message.toolCall) lastActivity = now();
      if (message.serverContent?.modelTurn || message.toolCall) {
        if (!modelActive) inputPendingUntil = 0;
        modelActive = true;
        interruptedTurn = false;
      }
      // Gemini ends an interrupted turn with a later turnComplete message.
      if (message.serverContent?.interrupted) { modelActive = false; interruptedTurn = true; }
      if (message.serverContent?.turnComplete) {
        if (!modelActive && !interruptedTurn) inputPendingUntil = 0; // A silent response can complete without chunks.
        modelActive = false;
        interruptedTurn = false;
      }
    },
    reset() { modelActive = false; interruptedTurn = false; inputPendingUntil = 0; lastActivity = now(); },
    isIdle() { return !modelActive && now() >= inputPendingUntil && now() - lastActivity >= 800; },
  };
}

export function matchesQuizFeedbackScope(value: unknown, scope: QuizFeedbackScope): boolean {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<QuizFeedbackScope>;
  return candidate.runId === scope.runId && candidate.objectiveId === scope.objectiveId && candidate.objectiveRevision === scope.objectiveRevision;
}

// One queue per connected objective: reconnects deliberately restore the saved summary.
export function createQuizFeedbackDelivery(scope: QuizFeedbackScope, transport: {
  load: () => Promise<QuizFeedbackSnapshot>;
  send: (context: string) => void;
  isIdle: () => boolean;
}) {
  let active = true;
  let sequence = 0;
  let pending: QuizFeedbackSnapshot | undefined;
  let contextDelivered = false;
  const delivered = new Set<string>();
  return {
    async refresh() {
      const request = ++sequence;
      pending = undefined;
      const snapshot = await transport.load();
      if (!active || request !== sequence) return;
      if (!matchesQuizFeedbackScope(snapshot, scope)) { pending = undefined; return; }
      pending = snapshot.context && (!contextDelivered || snapshot.eventIds.some(id => !delivered.has(id))) ? snapshot : undefined;
    },
    flush() {
      if (!active || !pending || !transport.isIdle()) return;
      transport.send(pending.context);
      contextDelivered = true;
      pending.eventIds.forEach(id => delivered.add(id));
      pending = undefined;
    },
    dispose() { active = false; sequence += 1; pending = undefined; },
  };
}
