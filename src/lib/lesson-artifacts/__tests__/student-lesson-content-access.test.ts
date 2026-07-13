import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSessionMock = vi.fn();
const createServerSupabaseMock = vi.fn();

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth', () => ({ getServerSession: getServerSessionMock }));
vi.mock('@/lib/supabase.server', () => ({ createServerSupabase: createServerSupabaseMock }));

const lessonId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function terminal(data: unknown) {
  return { maybeSingle: vi.fn().mockResolvedValue({ data, error: null }) };
}

function createHarness(lessonGrade: string, studentGrade: string) {
  const lessonContentOrder = vi.fn().mockResolvedValue({ data: [{ id: 'content-1' }], error: null });
  const from = vi.fn((table: string) => {
    if (table === 'lessons') {
      return { select: vi.fn(() => ({ eq: vi.fn(() => terminal({
        id: lessonId,
        gradelevel: lessonGrade,
        teacher_id: null,
      })) })) };
    }
    if (table === 'students') {
      return { select: vi.fn(() => ({ eq: vi.fn(() => terminal({ grade: studentGrade })) })) };
    }
    if (table === 'lesson_content') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({ order: lessonContentOrder })),
            order: lessonContentOrder,
          })),
          order: lessonContentOrder,
        })),
      };
    }
    if (table === 'teachers') {
      return { select: vi.fn(() => ({ eq: vi.fn(() => terminal(null)) })) };
    }
    throw new Error(`Unexpected table ${table}`);
  });
  createServerSupabaseMock.mockReturnValue({ from });
  return { lessonContentOrder };
}

describe('student lesson content authorization', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    getServerSessionMock.mockResolvedValue({ user: { id: 'student-1', role: 'student' } });
  });

  it.each([
    ['content', async () => (await import('@/app/api/content/route')).GET],
    ['resources', async () => (await import('@/app/api/resources/route')).GET],
  ])('rejects %s from a lesson outside the student grade', async (_name, loadGet) => {
    const harness = createHarness('JHS 2', 'JHS 1');
    const GET = await loadGet();

    const response = await GET(new Request(`http://localhost/api/content?lessonId=${lessonId}`));

    expect(response.status).toBe(403);
    expect(harness.lessonContentOrder).not.toHaveBeenCalled();
  });

  it.each([
    ['content', async () => (await import('@/app/api/content/route')).GET],
    ['resources', async () => (await import('@/app/api/resources/route')).GET],
  ])('allows %s for a student in the lesson grade', async (_name, loadGet) => {
    createHarness('JHS 1', 'jhs 1');
    const GET = await loadGet();

    const response = await GET(new Request(`http://localhost/api/content?lessonId=${lessonId}`));

    expect(response.status).toBe(200);
  });
});
