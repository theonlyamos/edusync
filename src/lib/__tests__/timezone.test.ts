import { describe, expect, it } from 'vitest';
import { isValidTimezone, pickTimezone, zonedInput, zonedValue } from '@/lib/timezone';

describe('timezone helpers', () => {
  it('checks timezone names', () => {
    expect(isValidTimezone('Africa/Accra')).toBe(true);
    expect(isValidTimezone('Not/AZone')).toBe(false);
    expect(isValidTimezone('')).toBe(false);
    expect(pickTimezone(null, 'bad', 'Africa/Lagos')).toBe('Africa/Lagos');
    expect(pickTimezone(undefined)).toBe('UTC');
  });

  it('shows an instant in the school zone', () => {
    expect(zonedInput('2026-10-22T15:00:00.000Z', 'Africa/Accra')).toBe('2026-10-22T15:00');
    expect(zonedInput('2026-10-22T15:00:00.000Z', 'Africa/Lagos')).toBe('2026-10-22T16:00');
    expect(zonedInput('2026-10-22T03:30:00.000Z', 'America/New_York')).toBe('2026-10-21T23:30');
  });

  it('reads a typed time in the school zone', () => {
    expect(zonedValue('2026-10-22T16:00', 'Africa/Lagos')).toBe('2026-10-22T15:00:00.000Z');
    expect(zonedValue('2026-10-22T15:00', 'UTC')).toBe('2026-10-22T15:00:00.000Z');
    // Summer and winter offsets in London.
    expect(zonedValue('2026-07-01T09:00', 'Europe/London')).toBe('2026-07-01T08:00:00.000Z');
    expect(zonedValue('2026-12-01T09:00', 'Europe/London')).toBe('2026-12-01T09:00:00.000Z');
  });

  it('rejects times skipped by a clock change', () => {
    expect(() => zonedValue('2026-03-29T01:30', 'Europe/London')).toThrow(/skipped/);
    // The repeated hour when clocks go back still resolves to a real instant.
    expect(zonedInput(zonedValue('2026-10-25T01:30', 'Europe/London'), 'Europe/London')).toBe('2026-10-25T01:30');
  });

  it('round-trips', () => {
    for (const zone of ['Africa/Accra', 'Asia/Kolkata', 'America/Los_Angeles']) {
      const iso = '2026-03-15T12:45:00.000Z';
      expect(zonedValue(zonedInput(iso, zone), zone)).toBe(iso);
    }
  });
});
