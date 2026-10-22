import { beforeEach, describe, expect, it, vi } from 'vitest';

// Plain functions, not vi.fn(): Vitest's spies report a rejected return value
// as a test failure even when the code under test handles it.
let rpcImpl: (name: string, args: Record<string, unknown>) => unknown = () => ({ data: true, error: null });
const calls: Array<[string, Record<string, unknown>]> = [];

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase.server', () => ({
  createServerSupabase: () => ({
    rpc: (name: string, args: Record<string, unknown>) => {
      calls.push([name, args]);
      return rpcImpl(name, args);
    },
  }),
}));

import { dailyCapKey, enforceDailyCap } from '@/lib/daily-caps';

describe('daily caps', () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it('keys counters by tool, student and UTC day', () => {
    expect(dailyCapKey('practice', 'u1', new Date('2026-10-22T23:30:00Z'))).toBe('daily:practice:u1:2026-10-22');
  });

  it('lets the request through while under the cap', async () => {
    rpcImpl = async () => ({ data: true, error: null });
    expect(await enforceDailyCap('companion', 'u1')).toBeNull();
    expect(calls[0][0]).toBe('hit_rate_limit');
    expect(calls[0][1]).toMatchObject({ p_max: 60 });
  });

  it('returns a friendly 429 once the cap is reached', async () => {
    rpcImpl = async () => ({ data: false, error: null });
    const response = await enforceDailyCap('practice', 'u1');
    expect(response?.status).toBe(429);
    const body = await response!.json();
    expect(body.code).toBe('daily_cap_reached');
    expect(body.error).toContain('10 practice sets');
  });

  it('fails open when the counter is unavailable', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    rpcImpl = async () => ({ data: null, error: { message: 'down' } });
    expect(await enforceDailyCap('collaborator', 'u1')).toBeNull();
    rpcImpl = async () => {
      throw new Error('network down');
    };
    expect(await enforceDailyCap('collaborator', 'u1')).toBeNull();
    expect(log).toHaveBeenCalledTimes(2);
    log.mockRestore();
  });
});
