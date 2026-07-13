import { describe, expect, it } from 'vitest';

import { shouldClearInvalidRefreshSession } from '../auth-session';

describe('browser auth session recovery', () => {
  it('clears only invalid or missing refresh-token failures', () => {
    expect(shouldClearInvalidRefreshSession(new Error('Invalid Refresh Token: Refresh Token Not Found'))).toBe(true);
    expect(shouldClearInvalidRefreshSession({ message: 'refresh_token_not_found' })).toBe(true);
    expect(shouldClearInvalidRefreshSession(new Error('Network request failed'))).toBe(false);
  });
});
