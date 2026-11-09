/** Raised hands in a live class, kept as a LiveKit participant attribute so late joiners see them too. */
export const HAND_ATTRIBUTE = 'hand';

/** When a participant raised their hand (ms), or null when it is down. */
export function handRaisedAt(attributes: Record<string, string> | null | undefined): number | null {
  const at = Number(attributes?.[HAND_ATTRIBUTE]);
  return Number.isFinite(at) && at > 0 ? at : null;
}

/** The attribute value for a hand going up (the time, so hands can be answered in order) or down. */
export const handAttribute = (raised: boolean, now: number = Date.now()): Record<string, string> => ({ [HAND_ATTRIBUTE]: raised ? String(now) : '' });

/** Who may change whose hand: anyone their own; the host may only lower someone else's. */
export function canSetHand(input: { callerId: string; hostId: string | null; targetId: string; raised: boolean }): boolean {
  if (input.targetId === input.callerId) return true;
  return input.callerId === input.hostId && !input.raised;
}

/** Raised hands first, in the order they went up. */
export function compareHands(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}
