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

  it('passes the measured drawable area to session fallback generation', async () => {
    const { POST } = await import('@/app/api/learning-runs/[runId]/artifacts/next/route');
    await POST(new Request('http://localhost/api/learning-runs/run-1/artifacts/next', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'visualization', requestId: 'phone-1', panelDimensions: { width: 296, height: 420 } }),
    }) as never, { params: Promise.resolve({ runId: 'run-1' }) });
    expect(resolveNextLearningArtifactMock).toHaveBeenCalledWith(expect.objectContaining({ panelDimensions: { width: 296, height: 420 } }));
  });

  it('rejects invalid display sizes before artifact resolution', async () => {
    const { POST } = await import('@/app/api/learning-runs/[runId]/artifacts/next/route');
    const response = await POST(new Request('http://localhost/api/learning-runs/run-1/artifacts/next', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'visualization', requestId: 'phone-2', panelDimensions: { width: -1, height: 9000 } }),
    }) as never, { params: Promise.resolve({ runId: 'run-1' }) });
    expect(response.status).toBe(400);
    expect(resolveNextLearningArtifactMock).not.toHaveBeenCalled();
  });
});
