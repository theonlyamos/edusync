import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const sendKeyEvent = vi.fn(async () => null);
vi.mock('server-only', () => ({}));
vi.mock('@/lib/webhooks.server', () => ({ sendKeyEvent }));
vi.mock('next/server', async (original) => ({ ...(await original<typeof import('next/server')>()), after: (work: () => unknown) => { void work(); } }));
vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: () => ({ userId: 'u1', authType: 'apiKey', apiKeyId: 'k1' }) }));

// A stand-in for the sessions table: one row, and updates that honour `.is('ended_at', null)`.
let row: Record<string, unknown>;
let inserted: Record<string, unknown>[];
const table = () => {
  let changes: Record<string, unknown> | null = null;
  let onlyIfRunning = false;
  const apply = () => {
    if (!changes) return [row];
    if (onlyIfRunning && row.ended_at) return [];
    row = { ...row, ...changes };
    return [row];
  };
  const chain: Record<string, unknown> = {
    select: () => chain,
    update: (next: Record<string, unknown>) => { changes = next; return chain; },
    insert: (rows: Record<string, unknown>[]) => { inserted.push(...rows); return chain; },
    eq: () => chain,
    is: () => { onlyIfRunning = true; return chain; },
    maybeSingle: async () => ({ data: row, error: null }),
    single: async () => ({ data: { id: 's-new', credits: 5 }, error: null }),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: apply(), error: null }).then(resolve),
  };
  return chain;
};
vi.mock('@/lib/supabase.server', () => ({
  createServerSupabase: () => ({ from: table }),
  createSSRUserSupabase: async () => ({ from: table }),
}));

const { PATCH } = await import('@/app/api/learning/sessions/[id]/route');
const { POST: createEmbedSession } = await import('@/app/api/embed/sessions/route');

const end = () => PATCH(
  new NextRequest('https://app.test/api/learning/sessions/s1', { method: 'PATCH', body: JSON.stringify({ status: 'ended', ended: true }) }),
  { params: Promise.resolve({ id: 's1' }) },
);

beforeEach(() => {
  sendKeyEvent.mockClear();
  inserted = [];
  row = { id: 's1', user_id: 'u1', api_key_id: 'k1', topic: 'Fractions', created_at: '2026-11-10T09:00:00.000Z', ended_at: null };
});

describe('session.ended', () => {
  it('is sent once when two requests end the same session at the same moment', async () => {
    const answers = await Promise.all([end(), end()]);
    expect(answers.map((answer) => answer.status)).toEqual([200, 200]);
    expect(sendKeyEvent).toHaveBeenCalledTimes(1);
    expect(sendKeyEvent).toHaveBeenCalledWith('k1', 'session.ended', expect.objectContaining({ sessionId: 's1', topic: 'Fractions', startedAt: '2026-11-10T09:00:00.000Z' }));
  });

  it('is not sent again for a session that had already ended', async () => {
    row.ended_at = '2026-11-10T09:10:00.000Z';
    expect((await end()).status).toBe(200);
    expect(sendKeyEvent).not.toHaveBeenCalled();
  });

  it('is not sent for a session that did not come from an API key', async () => {
    row.api_key_id = null;
    expect((await end()).status).toBe(200);
    expect(sendKeyEvent).not.toHaveBeenCalled();
  });
});

describe('session.started', () => {
  it('is sent when a session is made through the embed sessions endpoint', async () => {
    const answer = await createEmbedSession(new NextRequest('https://app.test/api/embed/sessions', { method: 'POST', body: JSON.stringify({ topic: 'Algebra' }) }));
    expect(answer.status).toBe(200);
    expect(sendKeyEvent).toHaveBeenCalledWith('k1', 'session.started', expect.objectContaining({ sessionId: 's-new', topic: 'Algebra' }));
  });
});
