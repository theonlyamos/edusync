import { randomUUID } from 'node:crypto';

import { processContentJobBatch } from '../src/lib/lesson-artifacts/job-processor';
import { runContentWorker } from '../src/lib/lesson-artifacts/content-worker-runtime';

const workerId = `content-worker:${process.pid}:${randomUUID()}`;
const pollIntervalMs = Number(process.env.CONTENT_JOB_POLL_MS ?? 2_000);

runContentWorker({
  workerId,
  processBatch: processContentJobBatch,
  pollIntervalMs,
}).catch((error) => {
  console.error('Content worker stopped:', error);
  process.exitCode = 1;
});
