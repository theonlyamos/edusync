import { after } from 'next/server';

/**
 * Runs a follow-up job once the response has gone out, so it never slows the
 * request down. Outside a request (tests, scripts) it just runs in the background.
 */
export function afterResponse(task: () => Promise<unknown>): void {
  const safe = () => task().catch((error) => console.error('[after-response]', error));
  try {
    after(safe);
  } catch {
    void safe();
  }
}
