import { beforeEach, describe, expect, it, vi } from 'vitest';

const session = vi.fn();
const database = vi.fn();
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth', () => ({ getServerSession: session }));
vi.mock('@/lib/supabase.server', () => ({ createServerSupabase: database }));
vi.mock('@/lib/school', () => ({ getUserSchoolId: vi.fn(async () => 'school') }));

function harness() {
  const calls: unknown[][] = [];
  const supabase = { from: (table: string) => {
    const chain = {
      select: () => chain,
      eq: (...args: unknown[]) => { calls.push([table, 'eq', ...args]); return chain; },
      is: (...args: unknown[]) => { calls.push([table, 'is', ...args]); return chain; },
      not: (...args: unknown[]) => { calls.push([table, 'not', ...args]); return chain; },
      order: async () => ({ data: [], error: null }),
      maybeSingle: async () => ({ data: { id: 'teacher-row' }, error: null }),
    };
    return chain;
  } };
  database.mockReturnValue(supabase);
  return calls;
}

async function list(role: string, query = '') {
  session.mockResolvedValue({ user: { id: 'user', role } });
  const calls = harness();
  const { GET } = await import('@/app/api/lessons/route');
  const response = await GET(new Request(`http://localhost/api/lessons${query}`));
  expect(response.status).toBe(200);
  return calls;
}

beforeEach(() => vi.clearAllMocks());

describe('lesson list visibility', () => {
  it('shows students only published, unarchived lessons from their school', async () => {
    const calls = await list('student');
    expect(calls).toContainEqual(['lessons', 'is', 'archived_at', null]);
    expect(calls).toContainEqual(['lessons', 'not', 'current_publication_id', 'is', null]);
    expect(calls).toContainEqual(['lessons', 'eq', 'organization_id', 'school']);
  });

  it('ignores the archived view for students', async () => {
    const calls = await list('student', '?archived=only');
    expect(calls).toContainEqual(['lessons', 'is', 'archived_at', null]);
    expect(calls).not.toContainEqual(['lessons', 'not', 'archived_at', 'is', null]);
  });

  it('lets teachers see their drafts and their archived lessons', async () => {
    const active = await list('teacher');
    expect(active).not.toContainEqual(['lessons', 'not', 'current_publication_id', 'is', null]);
    expect(active).toContainEqual(['lessons', 'eq', 'teacher_id', 'teacher-row']);
    const archived = await list('teacher', '?archived=only');
    expect(archived).toContainEqual(['lessons', 'not', 'archived_at', 'is', null]);
  });
});
