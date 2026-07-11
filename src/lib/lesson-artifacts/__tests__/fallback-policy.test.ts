import { describe, expect, it } from 'vitest';

import { canReserveLearningFallback, parseLearningFallbackLimit } from '../fallback-policy';

describe('learning fallback policy', () => {
  it('uses a safe finite default and rejects invalid overrides', () => {
    expect(parseLearningFallbackLimit(undefined)).toBe(6);
    expect(parseLearningFallbackLimit('12')).toBe(12);
    expect(parseLearningFallbackLimit('0')).toBe(6);
    expect(parseLearningFallbackLimit('unlimited')).toBe(6);
  });

  it('allows only reservations below the configured limit', () => {
    expect(canReserveLearningFallback({ used: 5, limit: 6 })).toBe(true);
    expect(canReserveLearningFallback({ used: 6, limit: 6 })).toBe(false);
  });
});
