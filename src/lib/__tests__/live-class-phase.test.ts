import { describe, expect, it } from 'vitest';
import { groupLiveClasses, liveClassPhase, startsInLabel } from '../live-class-phase';

const now = new Date('2026-10-22T12:00:00Z');
const ev = (start: string, end: string, status = 'scheduled', id = start) => ({ id, status, scheduled_start_at: start, scheduled_end_at: end });

describe('liveClassPhase', () => {
  it('treats a class past its end as past even if still marked scheduled', () => {
    expect(liveClassPhase(ev('2026-03-01T09:00:00Z', '2026-03-01T10:00:00Z'), now)).toBe('past');
  });
  it('treats a started class as happening now', () => {
    expect(liveClassPhase(ev('2026-10-22T11:30:00Z', '2026-10-22T12:30:00Z'), now)).toBe('now');
    expect(liveClassPhase(ev('2026-10-22T12:10:00Z', '2026-10-22T13:00:00Z', 'live'), now)).toBe('now');
  });
  it('treats ended or cancelled classes as past', () => {
    expect(liveClassPhase(ev('2026-10-22T11:30:00Z', '2026-10-22T12:30:00Z', 'ended'), now)).toBe('past');
    expect(liveClassPhase(ev('2026-10-23T09:00:00Z', '2026-10-23T10:00:00Z', 'cancelled'), now)).toBe('past');
  });
  it('treats future classes as upcoming', () => {
    expect(liveClassPhase(ev('2026-10-23T09:00:00Z', '2026-10-23T10:00:00Z'), now)).toBe('upcoming');
  });
});

describe('groupLiveClasses', () => {
  it('orders upcoming soonest first and past most recent first', () => {
    const groups = groupLiveClasses([
      ev('2026-10-25T09:00:00Z', '2026-10-25T10:00:00Z'),
      ev('2026-10-23T09:00:00Z', '2026-10-23T10:00:00Z'),
      ev('2026-03-01T09:00:00Z', '2026-03-01T10:00:00Z'),
      ev('2026-10-20T09:00:00Z', '2026-10-20T10:00:00Z'),
    ], now);
    expect(groups.upcoming.map((e) => e.id)).toEqual(['2026-10-23T09:00:00Z', '2026-10-25T09:00:00Z']);
    expect(groups.past.map((e) => e.id)).toEqual(['2026-10-20T09:00:00Z', '2026-03-01T09:00:00Z']);
  });
});

describe('startsInLabel', () => {
  const now = new Date('2026-10-22T15:00:00Z');
  it('counts down within a day', () => {
    expect(startsInLabel('2026-10-22T15:10:00Z', now)).toBe('Starts in 10 min');
    expect(startsInLabel('2026-10-22T17:30:00Z', now)).toBe('Starts in 2 h 30 min');
    expect(startsInLabel('2026-10-22T16:00:00Z', now)).toBe('Starts in 1 h');
  });
  it('gives nothing for past or far-off classes', () => {
    expect(startsInLabel('2026-10-22T14:00:00Z', now)).toBeNull();
    expect(startsInLabel('2026-10-24T15:00:00Z', now)).toBeNull();
  });
});
