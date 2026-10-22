import { describe, expect, it } from 'vitest';
import { groupLiveClasses, liveClassPhase } from '../live-class-phase';

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
