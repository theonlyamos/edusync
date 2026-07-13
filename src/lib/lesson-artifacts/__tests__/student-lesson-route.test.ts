import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireStudentSessionMock = vi.fn();
const createServerSupabaseMock = vi.fn();

vi.mock('server-only', () => ({}));

vi.mock('@/lib/lesson-artifacts/learning-server', () => ({
  requireStudentSession: requireStudentSessionMock,
}));

vi.mock('@/lib/supabase.server', () => ({
  createServerSupabase: createServerSupabaseMock,
}));

const lessonId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

type HarnessOptions = {
  lesson?: Record<string, unknown> | null;
  studentGrade?: string | null;
  publication?: Record<string, unknown> | null;
};

function maybeSingle(result: { data: unknown; error: unknown }) {
  return { maybeSingle: vi.fn().mockResolvedValue(result) };
}

function createHarness(options: HarnessOptions = {}) {
  const lesson = options.lesson === undefined
    ? { id: lessonId, gradelevel: 'JHS 1', current_publication_id: 'publication-1' }
    : options.lesson;
  const publication = options.publication === undefined
    ? {
        version: 7,
        manifest: {
          lesson: {
            id: lessonId,
            title: 'Published forces',
            subject: 'Physics',
            gradeLevel: 'JHS 1',
            content: 'Immutable content',
          },
          objectives: [
            { id: 'objective-2', text: 'Calculate net force.', position: 1, revision: 2, artifactIds: ['quiz-1'] },
            { id: 'objective-1', text: 'Define force.', position: 0, revision: 3, artifactIds: ['visual-1'] },
          ],
        },
      }
    : options.publication;

  const from = vi.fn((table: string) => {
    if (table === 'lessons') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => maybeSingle({ data: lesson, error: null })),
        })),
      };
    }
    if (table === 'students') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => maybeSingle({ data: { grade: options.studentGrade ?? 'jhs 1' }, error: null })),
        })),
      };
    }
    if (table === 'lesson_publications') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => maybeSingle({ data: publication, error: null })),
        })),
      };
    }
    if (table === 'lesson_artifacts') {
      return {
        select: vi.fn(() => ({
          in: vi.fn().mockResolvedValue({
            data: [
              { id: 'visual-1', kind: 'interactive_visualization' },
              { id: 'quiz-1', kind: 'structured_quiz' },
            ],
            error: null,
          }),
        })),
      };
    }
    throw new Error(`Unexpected table ${table}`);
  });

  createServerSupabaseMock.mockReturnValue({ from });
  return { from };
}

async function callGet() {
  const { GET } = await import('@/app/api/students/lessons/[lessonId]/route');
  const response = await GET(
    new Request(`http://localhost/api/students/lessons/${lessonId}`),
    { params: Promise.resolve({ lessonId }) },
  );
  return { response, json: await response.json() };
}

describe('student lesson detail route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    requireStudentSessionMock.mockResolvedValue({ user: { id: 'student-1', role: 'student' } });
  });

  it('returns the immutable publication with ordered approved-artifact counts', async () => {
    createHarness();

    const { response, json } = await callGet();

    expect(response.status).toBe(200);
    expect(json.publicationVersion).toBe(7);
    expect(json.lesson.title).toBe('Published forces');
    expect(json.objectives.map((objective: { id: string }) => objective.id)).toEqual(['objective-1', 'objective-2']);
    expect(json.objectives[0].artifactCounts).toEqual({ visualizations: 1, quizzes: 0, resources: 0 });
    expect(json.objectives[1].artifactCounts).toEqual({ visualizations: 0, quizzes: 1, resources: 0 });
  });

  it('returns 403 when the publication is outside the student grade', async () => {
    createHarness({ studentGrade: 'JHS 2' });

    const { response } = await callGet();

    expect(response.status).toBe(403);
  });

  it('returns 404 for an unknown lesson', async () => {
    createHarness({ lesson: null });

    const { response } = await callGet();

    expect(response.status).toBe(404);
  });

  it('returns an explicit unpublished response when no current publication exists', async () => {
    createHarness({ lesson: { id: lessonId, gradelevel: 'JHS 1', current_publication_id: null } });

    const { response, json } = await callGet();

    expect(response.status).toBe(409);
    expect(json.code).toBe('unpublished_lesson');
  });

  it('accepts a JSON-encoded structured objective snapshot', async () => {
    const objectives = [{
      id: '11111111-1111-4111-8111-111111111111',
      text: 'Define force.',
      position: 0,
      revision: 1,
      artifactIds: ['visual-1'],
    }];
    createHarness({ publication: {
      version: 2,
      manifest: {
        lesson: { id: lessonId, title: 'Forces', subject: 'Physics', gradeLevel: 'JHS 1', content: null },
        objectives: JSON.stringify(objectives),
      },
    } });

    const { response, json } = await callGet();

    expect(response.status).toBe(200);
    expect(json.objectives[0].id).toBe(objectives[0].id);
  });

  it('returns a recoverable unpublished response for text-only legacy snapshots', async () => {
    createHarness({ publication: {
      version: 1,
      manifest: {
        lesson: { id: lessonId, title: 'Forces', subject: 'Physics', gradeLevel: 'JHS 1', content: null },
        objectives: 'Define force.\nCalculate force.',
      },
    } });

    const { response, json } = await callGet();

    expect(response.status).toBe(409);
    expect(json.code).toBe('unpublished_lesson');
  });
});
