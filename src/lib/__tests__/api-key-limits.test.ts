import { describe, expect, it } from 'vitest';
import { parseRateLimits } from '@/lib/api-key-limits';

describe('parseRateLimits', () => {
  it('leaves out limits that were not sent', () => {
    expect(parseRateLimits({}, 'owner')).toEqual({ ok: true, values: {} });
    expect(parseRateLimits(null, 'owner')).toEqual({ ok: true, values: {} });
    expect(parseRateLimits({ rate_limit_per_day: 500 }, 'owner')).toEqual({ ok: true, values: { rate_limit_per_day: 500 } });
  });

  it('accepts limits up to the owner ceiling', () => {
    expect(parseRateLimits({ rate_limit_per_hour: 1000, rate_limit_per_day: 10000 }, 'owner')).toEqual({ ok: true, values: { rate_limit_per_hour: 1000, rate_limit_per_day: 10000 } });
  });

  it.each([0, -1, null, '500', 1.5, Number.NaN, Number.POSITIVE_INFINITY, 1001])('refuses an hourly limit of %j from an owner', (value) => {
    const result = parseRateLimits({ rate_limit_per_hour: value }, 'owner');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('hourly');
  });

  it.each([0, null, 10001])('refuses a daily limit of %j from an owner', (value) => {
    const result = parseRateLimits({ rate_limit_per_day: value }, 'owner');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('daily');
  });

  it('lets staff go higher, but never switch a limit off', () => {
    expect(parseRateLimits({ rate_limit_per_hour: 50000, rate_limit_per_day: 500000 }, 'staff').ok).toBe(true);
    expect(parseRateLimits({ rate_limit_per_hour: 0 }, 'staff').ok).toBe(false);
    expect(parseRateLimits({ rate_limit_per_day: 1000001 }, 'staff').ok).toBe(false);
  });
});
