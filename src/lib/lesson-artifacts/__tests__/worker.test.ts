import { describe, expect, it, vi } from 'vitest';

import { drainContentWorker, runContentWorker } from '../content-worker-runtime';

describe('content worker runtime', () => {
  it('drains bounded retry batches triggered by a request', async () => {
    const processBatch = vi.fn()
      .mockResolvedValueOnce([{ status: 'queued' }])
      .mockResolvedValueOnce([{ status: 'succeeded' }]);

    const results = await drainContentWorker({
      workerId: 'request:bundle-1',
      processBatch,
      batchLimit: 5,
      maxBatches: 4,
    });

    expect(processBatch).toHaveBeenCalledTimes(2);
    expect(results).toHaveLength(2);
  });

  it('checks for overflow when the claimed batch is full', async () => {
    const fullBatch = Array.from({ length: 5 }, () => ({ status: 'succeeded' }));
    const processBatch = vi.fn()
      .mockResolvedValueOnce(fullBatch)
      .mockResolvedValueOnce([{ status: 'succeeded' }]);

    const results = await drainContentWorker({
      workerId: 'request:bundle-2',
      processBatch,
      batchLimit: 5,
      maxBatches: 3,
    });

    expect(processBatch).toHaveBeenCalledTimes(2);
    expect(results).toHaveLength(6);
  });

  it('leaves one pass for new work after exhausting an older retry', async () => {
    const processBatch = vi.fn()
      .mockResolvedValueOnce([{ status: 'queued' }])
      .mockResolvedValueOnce([{ status: 'queued' }])
      .mockResolvedValueOnce([{ status: 'failed' }])
      .mockResolvedValueOnce([{ status: 'succeeded' }]);

    await drainContentWorker({
      workerId: 'request:regeneration-1',
      processBatch,
      batchLimit: 1,
    });

    expect(processBatch).toHaveBeenCalledTimes(4);
  });

  it('backs off and keeps polling after a batch error', async () => {
    const controller = new AbortController();
    const processBatch = vi.fn()
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockImplementationOnce(async () => {
        controller.abort();
        return [];
      });
    const sleep = vi.fn(async () => undefined);
    const onError = vi.fn();

    await runContentWorker({
      workerId: 'worker-1',
      processBatch,
      sleep,
      onError,
      signal: controller.signal,
      pollIntervalMs: 25,
      errorBackoffMs: 100,
    });

    expect(processBatch).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(sleep).toHaveBeenCalledWith(100);
  });
});
