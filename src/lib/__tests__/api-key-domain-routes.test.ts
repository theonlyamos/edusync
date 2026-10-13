import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isDomainAllowed } from '@/lib/api-key-auth';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  serverSupabase: vi.fn(),
  userSupabase: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ getServerSession: mocks.session }));
vi.mock('@/lib/supabase.server', () => ({
  createServerSupabase: mocks.serverSupabase,
  createSSRUserSupabase: mocks.userSupabase,
}));

function createDatabaseHarness() {
  let saved: Record<string, unknown> = {};
  const query = {
    eq: vi.fn(() => query),
    select: vi.fn(() => query),
    single: vi.fn(async () => ({ data: { id: 'key-1', role: 'admin', ...saved }, error: null })),
  };
  const insert = vi.fn((payload: Record<string, unknown> | Record<string, unknown>[]) => {
    saved = Array.isArray(payload) ? payload[0] : payload;
    return query;
  });
  const update = vi.fn((payload: Record<string, unknown>) => {
    saved = payload;
    return query;
  });
  const from = vi.fn((table: string) => {
    if (table === 'organizations' || table === 'organization_members') return query;
    if (table === 'embed_api_keys') return { insert, update };
    throw new Error(`Unexpected table: ${table}`);
  });
  mocks.serverSupabase.mockReturnValue({ from });
  mocks.userSupabase.mockResolvedValue({ from });
  return { insert, update, saved: () => saved };
}

const writers = [
  {
    name: 'admin organization create',
    method: 'POST',
    call: async (request: NextRequest) => {
      const { POST } = await import('@/app/api/admin/organizations/[id]/keys/route');
      return POST(request, { params: Promise.resolve({ id: 'org-1' }) });
    },
  },
  {
    name: 'admin organization update',
    method: 'PATCH',
    call: async (request: NextRequest) => {
      const { PATCH } = await import('@/app/api/admin/organizations/[id]/keys/[keyId]/route');
      return PATCH(request, { params: Promise.resolve({ id: 'org-1', keyId: 'key-1' }) });
    },
  },
  {
    name: 'personal create',
    method: 'POST',
    call: async (request: NextRequest) => {
      const { POST } = await import('@/app/api/embed/keys/route');
      return POST(request);
    },
  },
  {
    name: 'personal update',
    method: 'PATCH',
    call: async (request: NextRequest) => {
      const { PATCH } = await import('@/app/api/embed/keys/[id]/route');
      return PATCH(request, { params: Promise.resolve({ id: 'key-1' }) });
    },
  },
];

function request(method: string, body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/keys', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe.each(writers)('$name domain input', ({ method, call }) => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } });
  });

  it.each([
    { allowed_domains: ['localhost, insyte.vercel.app'] },
    { allowed_domains: 'localhost, INSYTE.VERCEL.APP\nlocalhost' },
  ])('stores individual canonical hosts from $allowed_domains', async ({ allowed_domains }) => {
    const db = createDatabaseHarness();
    const response = await call(request(method, { name: 'Demo', allowed_domains }));

    expect(response.ok).toBe(true);
    expect(db.saved().allowed_domains).toEqual(['localhost', 'insyte.vercel.app']);
    expect(isDomainAllowed('insyte.vercel.app', db.saved().allowed_domains as string[])).toBe(true);
    expect(isDomainAllowed('attacker.example', db.saved().allowed_domains as string[])).toBe(false);
  });

  it('canonicalizes exact and wildcard hosts without broadening them', async () => {
    const db = createDatabaseHarness();
    const response = await call(request(method, {
      name: 'Demo',
      allowed_domains: [' *.Example.COM. ', 'LOCALHOST', '127.0.0.1'],
    }));

    expect(response.ok).toBe(true);
    expect(db.saved().allowed_domains).toEqual(['*.example.com', 'localhost', '127.0.0.1']);
    expect(isDomainAllowed('app.example.com', db.saved().allowed_domains as string[])).toBe(true);
    expect(isDomainAllowed('evilexample.com', db.saved().allowed_domains as string[])).toBe(false);
  });

  if (method === 'POST') {
    it('stores canonical domain restrictions for an organization key', async () => {
      const db = createDatabaseHarness();
      const response = await call(request(method, {
        name: 'Organization demo',
        organization_id: 'org-1',
        allowed_domains: ['localhost, insyte.vercel.app'],
      }));

      expect(response.ok).toBe(true);
      expect(db.saved().organization_id).toBe('org-1');
      expect(db.saved().allowed_domains).toEqual(['localhost', 'insyte.vercel.app']);
    });
  }

  it.each([
    ['https://insyte.vercel.app'],
    ['insyte.vercel.app/path'],
    ['localhost:3000'],
    ['good.example', 'bad host.example'],
    ['bad..example'],
    ['-bad.example'],
    ['*'],
    ['sub.*.example'],
    ['good.example', 'bad_host.example'],
    ['good.example', ''],
    ', ,',
    ['good.example', 42],
    { host: 'insyte.vercel.app' },
  ].map(allowed_domains => ({ allowed_domains })))('rejects malformed domains $allowed_domains before any key write', async ({ allowed_domains }) => {
    const db = createDatabaseHarness();
    const response = await call(request(method, { name: 'Demo', allowed_domains }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: expect.stringMatching(/allowed domains/i) });
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it.each([null, [], '   '].map(allowed_domains => ({ allowed_domains })))('keeps explicitly empty domains $allowed_domains unrestricted', async ({ allowed_domains }) => {
    const db = createDatabaseHarness();
    const response = await call(request(method, { name: 'Demo', allowed_domains }));

    expect(response.ok).toBe(true);
    expect(db.saved().allowed_domains).toBeNull();
  });

  if (method === 'PATCH') {
    it('does not change domain restrictions when a patch omits the field', async () => {
      const db = createDatabaseHarness();
      const response = await call(request(method, { is_active: false }));

      expect(response.ok).toBe(true);
      expect(db.saved()).not.toHaveProperty('allowed_domains');
    });
  }

  it('requires authorization before accepting any domain input', async () => {
    const db = createDatabaseHarness();
    mocks.session.mockResolvedValue(null);
    const response = await call(request(method, { name: 'Demo', allowed_domains: ['example.com'] }));

    expect(response.status).toBe(401);
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });
});

describe('stored malformed domain authorization', () => {
  it('denies comma-separated hosts saved as one malformed array entry', () => {
    const malformed = ['localhost, insyte.vercel.app'];
    expect(isDomainAllowed('localhost', malformed)).toBe(false);
    expect(isDomainAllowed('insyte.vercel.app', malformed)).toBe(false);
    expect(isDomainAllowed('attacker.example', malformed)).toBe(false);
  });
});
