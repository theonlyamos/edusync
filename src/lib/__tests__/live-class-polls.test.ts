import { describe, expect, it } from 'vitest';
import { mergePollBroadcast, mergePollRefresh, parsePollBroadcast, parsePollInput, pollForViewer, tallyVotes, votePercent, type PollBroadcast, type PollView } from '@/lib/live-class-polls';

const open: PollBroadcast & { counts: number[] } = { id: 'p1', question: 'Which is larger?', options: ['1/2', '1/3'], status: 'open', totalVotes: 3, counts: [2, 1], createdAt: '2026-11-10T10:00:00.000Z', closedAt: null };
const closed = { ...open, status: 'closed' as const, closedAt: '2026-11-10T10:02:00.000Z' };

describe('parsePollInput', () => {
  it('tidies the question and drops blank answers', () => {
    expect(parsePollInput({ question: '  Which   is larger? ', options: [' 1/2 ', '', '1/3', '   '] })).toEqual({ ok: true, poll: { question: 'Which is larger?', options: ['1/2', '1/3'] } });
  });

  it.each([
    [{ question: '', options: ['a', 'b'] }, 'question'],
    [{ question: 'Q', options: ['a'] }, 'at least 2'],
    [{ question: 'Q', options: ['a', '  '] }, 'at least 2'],
    [{ question: 'Q', options: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }, 'up to 6'],
    [{ question: 'Q', options: ['Yes', 'yes'] }, 'the same'],
    [{ question: 'Q', options: ['a', 5] }, 'answers'],
    [{ question: 'Q', options: 'a,b' }, 'answers'],
    [{ question: 'x'.repeat(301), options: ['a', 'b'] }, 'under 300'],
    [{ question: 'Q', options: ['a', 'y'.repeat(121)] }, 'under 120'],
    [null, 'question'],
  ])('refuses %j', (input, reason) => {
    const result = parsePollInput(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(reason);
  });
});

describe('tallyVotes and votePercent', () => {
  it('counts answers per option and ignores anything outside them', () => {
    expect(tallyVotes(3, [0, 0, 2, 5, -1, null, undefined, 1.5])).toEqual([2, 0, 1]);
  });

  it('gives whole-number shares and copes with no answers', () => {
    expect(votePercent(1, 3)).toBe(33);
    expect(votePercent(0, 0)).toBe(0);
  });
});

describe('pollForViewer', () => {
  it('hides running totals from students while a poll is open', () => {
    expect(pollForViewer(open, { isHost: false, myVote: 1 })).toMatchObject({ counts: null, myVote: 1 });
  });

  it('shows the teacher the totals, and everyone once it has ended', () => {
    expect(pollForViewer(open, { isHost: true, myVote: null }).counts).toEqual([2, 1]);
    expect(pollForViewer(closed, { isHost: false, myVote: 0 }).counts).toEqual([2, 1]);
  });
});

describe('parsePollBroadcast', () => {
  it('reads a well-formed message', () => {
    expect(parsePollBroadcast({ ...closed })).toMatchObject({ id: 'p1', status: 'closed', counts: [2, 1], totalVotes: 3 });
  });

  it('drops totals that do not match the options, and nothing more', () => {
    expect(parsePollBroadcast({ ...open, counts: [1, 2, 3] })).toMatchObject({ counts: null });
    expect(parsePollBroadcast({ ...open, counts: [-1, 2] })).toMatchObject({ counts: null });
  });

  it.each([null, 'poll', {}, { ...open, id: 5 }, { ...open, options: ['only one'] }, { ...open, options: ['a', 2] }, { ...open, status: 'paused' }])('ignores %j', (payload) => {
    expect(parsePollBroadcast(payload)).toBeNull();
  });
});

describe('mergePollBroadcast', () => {
  const mine: PollView = { ...open, counts: null, myVote: 1 };

  it('shows a new poll with no answer picked', () => {
    expect(mergePollBroadcast(null, { ...open, counts: null })).toMatchObject({ id: 'p1', myVote: null, counts: null });
    expect(mergePollBroadcast(mine, { ...open, id: 'p2', createdAt: '2026-11-10T10:05:00.000Z', counts: null })).toMatchObject({ id: 'p2', myVote: null });
  });

  it('keeps this person’s answer when their poll ends, and adds the results', () => {
    expect(mergePollBroadcast(mine, closed)).toMatchObject({ status: 'closed', myVote: 1, counts: [2, 1] });
  });

  it('never reopens an ended poll or goes back to an older one', () => {
    const ended: PollView = { ...closed, myVote: 1 };
    expect(mergePollBroadcast(ended, { ...open, counts: null })).toBe(ended);
    expect(mergePollBroadcast(ended, { ...open, id: 'p0', createdAt: '2026-11-10T09:00:00.000Z', counts: null })).toBe(ended);
  });
});

describe('mergePollRefresh', () => {
  const mine: PollView = { ...open, counts: null, myVote: 1 };
  const newer: PollView = { ...open, id: 'p2', createdAt: '2026-11-10T10:05:00.000Z', counts: null, myVote: null };

  it('takes what the check found when nothing newer is showing', () => {
    expect(mergePollRefresh(null, mine)).toBe(mine);
    expect(mergePollRefresh(null, null)).toBeNull();
    expect(mergePollRefresh(mine, newer)).toBe(newer);
    expect(mergePollRefresh(mine, { ...closed, myVote: 1 })).toMatchObject({ status: 'closed', counts: [2, 1] });
  });

  it('keeps a poll the room just announced when a late check found the previous one or none', () => {
    expect(mergePollRefresh(newer, { ...closed, myVote: 1 })).toBe(newer);
    expect(mergePollRefresh(newer, null)).toBe(newer);
  });

  it('never reopens an ended poll or drops an answer already sent', () => {
    const ended: PollView = { ...closed, myVote: 1 };
    expect(mergePollRefresh(ended, mine)).toBe(ended);
    expect(mergePollRefresh(mine, { ...mine, myVote: null })).toMatchObject({ myVote: 1 });
  });
});
