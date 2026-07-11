import { describe, expect, it } from 'vitest';

describe('standalone content worker imports', () => {
  it('loads the runtime processor without the Next.js server-only guard', async () => {
    const processor = await import('../job-processor');

    expect(processor.processContentJobBatch).toBeTypeOf('function');
  });
});
