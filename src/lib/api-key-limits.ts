/**
 * How many requests an API key may make. A key's owner can lower its limits,
 * or raise them up to the owner ceilings below; only platform staff can go
 * higher. A limit can never be switched off (zero, negative or empty).
 */
export const DEFAULT_RATE_LIMIT_PER_HOUR = 100;
export const DEFAULT_RATE_LIMIT_PER_DAY = 1000;
export const OWNER_MAX_PER_HOUR = 1000;
export const OWNER_MAX_PER_DAY = 10000;
export const STAFF_MAX_PER_HOUR = 100000;
export const STAFF_MAX_PER_DAY = 1000000;

export type RateLimitInput = { rate_limit_per_hour?: unknown; rate_limit_per_day?: unknown };
export type RateLimitValues = { rate_limit_per_hour?: number; rate_limit_per_day?: number };
export type RateLimitResult = { ok: true; values: RateLimitValues } | { ok: false; error: string };

function one(value: unknown, label: string, max: number): { value?: number; error?: string } {
  if (value === undefined) return {};
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > max) {
    return { error: `The ${label} limit must be a whole number from 1 to ${max.toLocaleString('en-US')}.` };
  }
  return { value };
}

/**
 * Checks the limits in a request. A limit that was not sent is left out of
 * `values`, so an update leaves it as it is.
 */
export function parseRateLimits(input: RateLimitInput | null | undefined, who: 'owner' | 'staff'): RateLimitResult {
  const hour = one(input?.rate_limit_per_hour, 'hourly', who === 'staff' ? STAFF_MAX_PER_HOUR : OWNER_MAX_PER_HOUR);
  if (hour.error) return { ok: false, error: hour.error };
  const day = one(input?.rate_limit_per_day, 'daily', who === 'staff' ? STAFF_MAX_PER_DAY : OWNER_MAX_PER_DAY);
  if (day.error) return { ok: false, error: day.error };
  const values: RateLimitValues = {};
  if (hour.value !== undefined) values.rate_limit_per_hour = hour.value;
  if (day.value !== undefined) values.rate_limit_per_day = day.value;
  return { ok: true, values };
}
