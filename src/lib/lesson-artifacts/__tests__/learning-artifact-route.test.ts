import { beforeEach, describe, expect, it, vi } from 'vitest';

const resolveNextLearningArtifactMock = vi.fn();

vi.mock('server-only', () => ({}));
vi.mock('@/lib/lesson-artifacts/learning-server', () => ({
  resolveNextLearningArtifact: resolveNextLearningArtifactMock,
}));
vi.mock('@/lib/rate-limiter', () => ({ rateLimit: vi.fn().mockResolvedValue(null) }));

describe('next learning artifact route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    resolveNextLearningArtifactMock.mockResolvedValue({ instanceId: 'instance-1' });
  });

  it('passes the learner task description to approved-first resolution', async () => {
    const { POST } = await import('@/app/api/learning-runs/[runId]/artifacts/next/route');
    const response = await POST(new Request('http://localhost/api/learning-runs/run-1/artifacts/next', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'visualization',
        requestId: 'voice:run-1:call-1',
        taskDescription: 'Compare balanced and unbalanced forces.',
      }),
    }) as never, { params: Promise.resolve({ runId: 'run-1' }) });

    expect(response.status).toBe(200);
    expect(resolveNextLearningArtifactMock).toHaveBeenCalledWith({
      runId: 'run-1',
      kind: 'visualization',
      requestId: 'voice:run-1:call-1',
      taskDescription: 'Compare balanced and unbalanced forces.',
    });
  });
});
