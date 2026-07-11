export interface ContentWorkerOptions {
  workerId: string;
  processBatch: (workerId: string, limit: number) => Promise<unknown[]>;
  sleep?: (milliseconds: number) => Promise<void>;
  onError?: (error: unknown) => void;
  signal?: AbortSignal;
  batchLimit?: number;
  pollIntervalMs?: number;
  errorBackoffMs?: number;
}

interface ContentWorkerDrainOptions {
  workerId: string;
  processBatch: (workerId: string, limit: number) => Promise<unknown[]>;
  batchLimit?: number;
  maxBatches?: number;
}

const defaultSleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export async function drainContentWorker({
  workerId,
  processBatch,
  batchLimit = 5,
  maxBatches = 4,
}: ContentWorkerDrainOptions) {
  const processed: unknown[] = [];
  for (let pass = 0; pass < maxBatches; pass++) {
    const results = await processBatch(workerId, batchLimit);
    processed.push(...results);
    const hasImmediateRetry = results.some(
      (result) => result !== null && typeof result === 'object' && 'status' in result && result.status === 'queued',
    );
    if (!hasImmediateRetry && results.length < batchLimit) break;
  }
  return processed;
}

export async function runContentWorker({
  workerId,
  processBatch,
  sleep = defaultSleep,
  onError = (error) => console.error('Content worker batch failed:', error),
  signal,
  batchLimit = 5,
  pollIntervalMs = 2_000,
  errorBackoffMs = 5_000,
}: ContentWorkerOptions) {
  while (!signal?.aborted) {
    try {
      const results = await processBatch(workerId, batchLimit);
      if (results.length === 0 && !signal?.aborted) await sleep(pollIntervalMs);
    } catch (error) {
      onError(error);
      if (!signal?.aborted) await sleep(errorBackoffMs);
    }
  }
}
