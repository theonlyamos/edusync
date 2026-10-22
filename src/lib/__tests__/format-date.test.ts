import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime, formatDateTimeRange } from '@/lib/format-date';

describe('format-date', () => {
  it('uses one style', () => {
    expect(formatDate('2026-10-22T15:08:30Z', 'UTC')).toBe('22 Oct 2026');
    expect(formatDateTime('2026-10-22T15:08:30Z', 'UTC')).toBe('22 Oct 2026, 15:08');
    expect(formatDateTime('2026-10-22T15:08:30Z', 'Africa/Lagos')).toBe('22 Oct 2026, 16:08');
    expect(formatDate(null)).toBe('Not available');
    expect(formatDate('nope')).toBe('Not available');
  });
  it('shortens same-day ranges', () => {
    expect(formatDateTimeRange('2026-10-22T15:00:00Z', '2026-10-22T16:00:00Z', 'UTC')).toBe('22 Oct 2026, 15:00–16:00');
    expect(formatDateTimeRange('2026-10-22T23:00:00Z', '2026-10-23T01:00:00Z', 'UTC')).toBe('22 Oct 2026, 23:00 – 23 Oct 2026, 01:00');
  });
});
