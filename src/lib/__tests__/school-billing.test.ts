import { describe, expect, it } from 'vitest';
import {
  monthStartUtc,
  netUsageByKind,
  parsePurchaseCredits,
  schoolBalance,
  summarizeAuthoringUsage,
  trialDaysLeft,
} from '../school-billing';

const now = new Date('2026-10-21T12:00:00Z');

describe('schoolBalance', () => {
  it('adds a running trial to purchased credits', () => {
    const b = schoolBalance({ credits: 100, trial_credits: 250, trial_expires_at: '2026-11-01T00:00:00Z' }, now);
    expect(b).toMatchObject({ paid: 100, trial: 250, total: 350, trialActive: true, low: false });
    expect(trialDaysLeft(b, now)).toBe(11);
  });

  it('ignores trial credits once the trial has ended', () => {
    const b = schoolBalance({ credits: 20, trial_credits: 250, trial_expires_at: '2026-10-20T00:00:00Z' }, now);
    expect(b).toMatchObject({ paid: 20, trial: 0, total: 20, trialActive: false, trialExpiresAt: null, low: true });
    expect(trialDaysLeft(b, now)).toBeNull();
  });
});

describe('parsePurchaseCredits', () => {
  it('accepts whole amounts within the limits only', () => {
    expect(parsePurchaseCredits(500)).toBe(500);
    expect(parsePurchaseCredits('20')).toBe(20);
    for (const bad of [9, 100_001, 10.5, 'abc', null, -50]) expect(parsePurchaseCredits(bad)).toBeNull();
  });
});

describe('summarizeAuthoringUsage', () => {
  it('counts visuals and images against the allowance, skipping refunds and concept suggestions', () => {
    const usage = summarizeAuthoringUsage([
      { category: 'interactive_generation', quantity: 3, reference_id: 'a' },
      { category: 'interactive_generation', quantity: 1, reference_id: 'b', credits_charged: 1 },
      { category: 'interactive_generation', quantity: 1, reference_id: 'c', credits_charged: 1, refunded_at: '2026-10-21T00:00:00Z' },
      { category: 'interactive_generation', quantity: 1, reference_id: 'creative-concept:x' },
      { category: 'image_generation', quantity: '2', reference_id: 'd', credits_charged: 2 },
      { category: 'quiz_generation', quantity: 5, reference_id: 'e' },
    ], { free_interactive_allowance: 3, free_image_allowance: '1' });
    expect(usage.visuals).toEqual({ used: 4, free: 3, overage: 1 });
    expect(usage.images).toEqual({ used: 2, free: 1, overage: 1 });
    expect(usage.creditsCharged).toBe(3);
  });

  it('falls back to the default allowance before a school has a quota row', () => {
    const usage = summarizeAuthoringUsage([], null);
    expect(usage.visuals.free).toBe(200);
    expect(usage.images.free).toBe(50);
  });
});

describe('netUsageByKind', () => {
  it('nets refunds against usage per kind', () => {
    expect(netUsageByKind([
      { transaction_type: 'usage', usage_kind: 'voice', credits: -5 },
      { transaction_type: 'refund', usage_kind: 'voice', credits: 5 },
      { transaction_type: 'usage', usage_kind: 'voice', credits: -5 },
      { transaction_type: 'usage', usage_kind: 'live_class', credits: -1 },
      { transaction_type: 'purchase', usage_kind: null, credits: 500 },
    ])).toEqual({ voice: 5, live_class: 1, visual: 0, image: 0 });
  });
});

it('buckets months in UTC like the database', () => {
  expect(monthStartUtc(new Date('2026-11-01T00:30:00+02:00')).toISOString()).toBe('2026-10-01T00:00:00.000Z');
});
