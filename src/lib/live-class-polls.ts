/** Quick polls in a live class: the rules shared by the server, the room and tests. */

export const POLL_TOPIC = 'poll';
export const POLL_MIN_OPTIONS = 2;
export const POLL_MAX_OPTIONS = 6;
export const POLL_QUESTION_MAX = 300;
export const POLL_OPTION_MAX = 120;

export type PollStatus = 'open' | 'closed';

/** A poll as one person sees it. */
export type PollView = {
  id: string;
  question: string;
  options: string[];
  status: PollStatus;
  /** Which option this person picked, or null. */
  myVote: number | null;
  totalVotes: number;
  /** Answers per option. The teacher always gets them; students only once the poll has ended. */
  counts: number[] | null;
  createdAt: string;
  closedAt: string | null;
};

/** What the server sends to everyone in the room when a poll opens or ends. Never carries anyone's own answer. */
export type PollBroadcast = Omit<PollView, 'myVote'>;

export type PollInput = { question: string; options: string[] };

/** Checks what a teacher typed. Blank options are dropped; the rest must be 2 to 6 different answers. */
export function parsePollInput(input: unknown): { ok: true; poll: PollInput } | { ok: false; error: string } {
  const raw = (input ?? {}) as { question?: unknown; options?: unknown };
  const question = typeof raw.question === 'string' ? raw.question.trim().replace(/\s+/g, ' ') : '';
  if (!question) return { ok: false, error: 'Type the question first.' };
  if (question.length > POLL_QUESTION_MAX) return { ok: false, error: `Keep the question under ${POLL_QUESTION_MAX} characters.` };
  if (!Array.isArray(raw.options) || raw.options.some((option) => typeof option !== 'string')) return { ok: false, error: 'Add the answers students can pick from.' };
  const options = (raw.options as string[]).map((option) => option.trim().replace(/\s+/g, ' ')).filter(Boolean);
  if (options.length < POLL_MIN_OPTIONS) return { ok: false, error: `Add at least ${POLL_MIN_OPTIONS} answers.` };
  if (options.length > POLL_MAX_OPTIONS) return { ok: false, error: `A poll can have up to ${POLL_MAX_OPTIONS} answers.` };
  if (options.some((option) => option.length > POLL_OPTION_MAX)) return { ok: false, error: `Keep each answer under ${POLL_OPTION_MAX} characters.` };
  if (new Set(options.map((option) => option.toLowerCase())).size !== options.length) return { ok: false, error: 'Two answers are the same. Make each one different.' };
  return { ok: true, poll: { question, options } };
}

/** Answers per option. Anything outside the options is ignored. */
export function tallyVotes(optionCount: number, votes: Array<number | null | undefined>): number[] {
  const counts = Array.from({ length: optionCount }, () => 0);
  for (const vote of votes) if (Number.isInteger(vote) && (vote as number) >= 0 && (vote as number) < optionCount) counts[vote as number] += 1;
  return counts;
}

/** Whole-number share for a results bar. */
export const votePercent = (count: number, total: number): number => (total > 0 ? Math.round((count / total) * 100) : 0);

/** A student never gets the running totals of an open poll, so answers aren't swayed by the crowd. */
export function pollForViewer(poll: PollBroadcast & { counts: number[] }, viewer: { isHost: boolean; myVote: number | null }): PollView {
  return { ...poll, myVote: viewer.myVote, counts: viewer.isHost || poll.status === 'closed' ? poll.counts : null };
}

/** Reads a poll message from the room. Anything malformed is ignored. */
export function parsePollBroadcast(payload: unknown): PollBroadcast | null {
  const value = payload as Partial<PollBroadcast> | null;
  if (!value || typeof value !== 'object') return null;
  if (typeof value.id !== 'string' || typeof value.question !== 'string') return null;
  if (!Array.isArray(value.options) || value.options.length < POLL_MIN_OPTIONS || value.options.length > POLL_MAX_OPTIONS || value.options.some((option) => typeof option !== 'string')) return null;
  if (value.status !== 'open' && value.status !== 'closed') return null;
  const counts = Array.isArray(value.counts) && value.counts.length === value.options.length && value.counts.every((count) => Number.isInteger(count) && count >= 0) ? value.counts : null;
  return {
    id: value.id,
    question: value.question.slice(0, POLL_QUESTION_MAX),
    options: value.options.map((option) => option.slice(0, POLL_OPTION_MAX)),
    status: value.status,
    totalVotes: Number.isInteger(value.totalVotes) && (value.totalVotes as number) >= 0 ? (value.totalVotes as number) : 0,
    counts,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : '',
    closedAt: typeof value.closedAt === 'string' ? value.closedAt : null,
  };
}

/**
 * Folds a room message into what this person already has. Their own answer is
 * kept when it is the same poll, and an ended poll is never reopened by a late message.
 */
export function mergePollBroadcast(current: PollView | null, incoming: PollBroadcast): PollView {
  if (current && current.id === incoming.id) {
    if (current.status === 'closed' && incoming.status === 'open') return current;
    return { ...incoming, myVote: current.myVote, counts: incoming.counts ?? (incoming.status === 'open' ? current.counts : null) };
  }
  if (current && incoming.createdAt && current.createdAt && incoming.createdAt < current.createdAt) return current;
  return { ...incoming, myVote: null };
}
