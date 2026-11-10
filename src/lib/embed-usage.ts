export type UsageDay = { day: string; requests: number; sessions: number };

export const USAGE_DAYS = 30;

/** Cleans rows from the database into days with whole, non-negative counts. */
export function toUsageDays(rows: unknown): UsageDay[] {
  if (!Array.isArray(rows)) return [];
  const count = (value: unknown) => Math.max(0, Math.floor(Number(value) || 0));
  return rows.flatMap((row) => {
    const raw = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
    return typeof raw.day === 'string' && /^\d{4}-\d{2}-\d{2}/.test(raw.day) ? [{ day: raw.day.slice(0, 10), requests: count(raw.requests), sessions: count(raw.sessions) }] : [];
  });
}

export function usageTotals(days: UsageDay[]) {
  const requests = days.reduce((sum, day) => sum + day.requests, 0);
  const sessions = days.reduce((sum, day) => sum + day.sessions, 0);
  const busiest = days.reduce<UsageDay | null>((best, day) => (day.requests > (best?.requests ?? 0) ? day : best), null);
  return { requests, sessions, busiest, activeDays: days.filter((day) => day.requests > 0).length };
}

/** "9 Nov" for a YYYY-MM-DD day, read as UTC so it never shifts. */
export const usageDayLabel = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
