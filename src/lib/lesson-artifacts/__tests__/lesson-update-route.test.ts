import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSessionMock = vi.fn();
const createSSRUserSupabaseMock = vi.fn();
const createServerSupabaseMock = vi.fn();

vi.mock('@/lib/auth', () => ({
  getServerSession: getServerSessionMock,
}));

vi.mock('@/lib/supabase.server', () => ({
  createSSRUserSupabase: createSSRUserSupabaseMock,
  createServerSupabase: createServerSupabaseMock,
}));

const lessonId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const sourceOrganizationId = '11111111-1111-4111-8111-111111111111';
const targetOrganizationId = '22222222-2222-4222-8222-222222222222';
const teacherId = '33333333-3333-4333-8333-333333333333';
const userId = '44444444-4444-4444-8444-444444444444';
const updateBody = {
  title: 'Fractions',
  subject: 'Mathematics',
  gradeLevel: 'JHS 1',
  objectives: ['Compare fractions'],
  content: 'Lesson body',
};

type Result = { data: unknown; error: unknown };

function maybeSingle(result: Result) {
  return {
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
}

function createHarness(options: {
  actorRole?: 'teacher' | 'admin';
  currentOrganizationId?: string | null;
  memberships?: unknown[];
  membershipError?: unknown;
  updateError?: unknown;
}) {
  const lessonLookup = {
    select: vi.fn(() => ({
      eq: vi.fn(() => maybeSingle({
        data: {
          id: lessonId,
          teacher_id: teacherId,
          organization_id: options.currentOrganizationId === undefined
            ? sourceOrganizationId
            : options.currentOrganizationId,
        },
        error: null,
      })),
    })),
  };
  const teacherLookup = {
    select: vi.fn(() => ({
      eq: vi.fn(() => maybeSingle({ data: { user_id: userId }, error: null })),
    })),
  };
  const update = vi.fn(() => ({
    eq: vi.fn(() => ({
      select: vi.fn(() => maybeSingle({
        data: {
          id: lessonId,
          teacher_id: teacherId,
          organization_id: targetOrganizationId,
          ...updateBody,
          gradelevel: updateBody.gradeLevel,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
        error: options.updateError ?? null,
      })),
    })),
  }));
  const updateQuery = { update };
  let lessonFromCalls = 0;
  const userFrom = vi.fn((table: string) => {
    if (table === 'lessons') return lessonFromCalls++ === 0 ? lessonLookup : updateQuery;
    if (table === 'teachers') return teacherLookup;
    throw new Error(`Unexpected authenticated table ${table}`);
  });
  const membershipLookup = {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        in: vi.fn().mockResolvedValue({
          data: options.memberships ?? [],
          error: options.membershipError ?? null,
        }),
      })),
    })),
  };
  const trustedFrom = vi.fn((table: string) => {
    if (table === 'organization_members') return membershipLookup;
    throw new Error(`Unexpected trusted table ${table}`);
  });

  createSSRUserSupabaseMock.mockResolvedValue({ from: userFrom });
  createServerSupabaseMock.mockReturnValue({ from: trustedFrom });
  getServerSessionMock.mockResolvedValue({
    user: {
      id: userId,
      role: options.actorRole ?? 'teacher',
    },
  });

  return { update, membershipLookup, trustedFrom };
}

async function callPut(body: unknown) {
  const { PUT } = await import('@/app/api/lessons/[lessonId]/route');
  const response = await PUT(
    new Request(`http://localhost/api/lessons/${lessonId}`, {
      method: 'PUT',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    }) as never,
    { params: Promise.resolve({ lessonId }) },
  );

  return { response, json: await response.json() };
}

describe('lesson PUT organization transfers', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('preserves organization ownership and skips the trusted client when organizationId is omitted', async () => {
    const harness = createHarness({ currentOrganizationId: sourceOrganizationId });

    const { response } = await callPut(updateBody);

    expect(response.status).toBe(200);
    expect(createServerSupabaseMock).not.toHaveBeenCalled();
    expect(harness.update).toHaveBeenCalledOnce();
    const updateRow = (harness.update.mock.calls as unknown as [Record<string, unknown>][])[0][0];
    expect(updateRow).not.toHaveProperty('organization_id');
  });

  it('skips membership lookup when the supplied organization UUID is unchanged', async () => {
    const harness = createHarness({ currentOrganizationId: sourceOrganizationId });

    const { response } = await callPut({ ...updateBody, organizationId: sourceOrganizationId });

    expect(response.status).toBe(200);
    expect(createServerSupabaseMock).not.toHaveBeenCalled();
    expect(harness.update).toHaveBeenCalledOnce();
  });

  it('allows a teacher transfer with active source owner and target admin memberships', async () => {
    const harness = createHarness({
      currentOrganizationId: sourceOrganizationId,
      memberships: [
        { organization_id: sourceOrganizationId, role: 'owner', is_active: true },
        { organization_id: targetOrganizationId, role: 'admin', is_active: true },
      ],
    });

    const { response } = await callPut({ ...updateBody, organizationId: targetOrganizationId });

    expect(response.status).toBe(200);
    expect(harness.membershipLookup.select).toHaveBeenCalledWith('organization_id, role, is_active');
    expect(harness.update).toHaveBeenCalledWith(expect.objectContaining({ organization_id: targetOrganizationId }));
  });

  it.each([
    ['inactive source', [
      { organization_id: sourceOrganizationId, role: 'owner', is_active: false },
      { organization_id: targetOrganizationId, role: 'admin', is_active: true },
    ]],
    ['member target', [
      { organization_id: sourceOrganizationId, role: 'owner', is_active: true },
      { organization_id: targetOrganizationId, role: 'member', is_active: true },
    ]],
    ['missing source', [
      { organization_id: targetOrganizationId, role: 'admin', is_active: true },
    ]],
    ['missing target', [
      { organization_id: sourceOrganizationId, role: 'owner', is_active: true },
    ]],
  ])('denies a teacher transfer with %s membership', async (_case, memberships) => {
    const harness = createHarness({ currentOrganizationId: sourceOrganizationId, memberships });

    const { response, json } = await callPut({ ...updateBody, organizationId: targetOrganizationId });

    expect(response.status).toBe(403);
    expect(json).toEqual({ error: 'Not authorized to reassign this lesson organization' });
    expect(harness.update).not.toHaveBeenCalled();
  });

  it('queries only the target organization when transferring an unowned lesson', async () => {
    const harness = createHarness({
      currentOrganizationId: null,
      memberships: [{ organization_id: targetOrganizationId, role: 'owner', is_active: true }],
    });

    const { response } = await callPut({ ...updateBody, organizationId: targetOrganizationId });

    expect(response.status).toBe(200);
    const membershipFilter = harness.membershipLookup.select.mock.results[0].value.eq.mock.results[0].value.in;
    expect(membershipFilter).toHaveBeenCalledWith('organization_id', [targetOrganizationId]);
  });

  it('lets a global admin transfer without a membership lookup', async () => {
    const harness = createHarness({ actorRole: 'admin', currentOrganizationId: sourceOrganizationId });

    const { response } = await callPut({ ...updateBody, organizationId: targetOrganizationId });

    expect(response.status).toBe(200);
    expect(createServerSupabaseMock).not.toHaveBeenCalled();
    expect(harness.update).toHaveBeenCalledOnce();
  });

  it('returns 500 without updating when the membership lookup fails', async () => {
    const harness = createHarness({
      currentOrganizationId: sourceOrganizationId,
      membershipError: { message: 'database unavailable' },
    });

    const { response, json } = await callPut({ ...updateBody, organizationId: targetOrganizationId });

    expect(response.status).toBe(500);
    expect(json).toEqual({ error: 'Failed to update lesson' });
    expect(harness.update).not.toHaveBeenCalled();
  });

  it.each([null, 'not-a-uuid'])('returns stable 400 without updating for organizationId %j', async (organizationId) => {
    const harness = createHarness({ currentOrganizationId: sourceOrganizationId });

    const { response, json } = await callPut({ ...updateBody, organizationId });

    expect(response.status).toBe(400);
    expect(json).toEqual({ error: 'Invalid lesson update' });
    expect(harness.update).not.toHaveBeenCalled();
  });

  it('maps a known organization guard error during a real transfer to 403', async () => {
    const harness = createHarness({
      actorRole: 'admin',
      currentOrganizationId: sourceOrganizationId,
      updateError: { code: '42501', message: 'Not authorized to reassign lesson organization' },
    });

    const { response, json } = await callPut({ ...updateBody, organizationId: targetOrganizationId });

    expect(response.status).toBe(403);
    expect(json).toEqual({ error: 'Not authorized to reassign this lesson organization' });
  });

  it('keeps a non-transfer 42501 error on the generic 500 path', async () => {
    const harness = createHarness({
      currentOrganizationId: sourceOrganizationId,
      updateError: { code: '42501', message: 'Not authorized to reassign lesson organization' },
    });

    const { response, json } = await callPut(updateBody);

    expect(response.status).toBe(500);
    expect(json).toEqual({ error: 'Failed to update lesson' });
  });

  it('keeps an unknown 42501 transfer error on the generic 500 path', async () => {
    const harness = createHarness({
      actorRole: 'admin',
      currentOrganizationId: sourceOrganizationId,
      updateError: { code: '42501', message: 'permission denied for table lessons' },
    });

    const { response, json } = await callPut({ ...updateBody, organizationId: targetOrganizationId });

    expect(response.status).toBe(500);
    expect(json).toEqual({ error: 'Failed to update lesson' });
  });
});
