/**
 * School billing rules shared by the API routes and the dashboard widgets.
 * The database enforces the same numbers (migrations *_school_billing_*.sql);
 * keep the two in step.
 */

/** 1 credit buys 1 minute of live AI (voice tutor or live class). */
export const CREDIT_PRICE_CENTS = 10;
export const SCHOOL_TRIAL_CREDITS = 300;
export const SCHOOL_TRIAL_DAYS = 30;
/** Credits per lesson visual / image once the free monthly allowance is used. */
export const AUTHORING_CREDITS = { visual: 1, image: 2 } as const;
export const DEFAULT_FREE_ALLOWANCE = { visuals: 200, images: 50 } as const;
/** Below this many credits the widgets warn that the school is running low. */
export const LOW_BALANCE_CREDITS = 60;
export const MIN_SCHOOL_PURCHASE_CREDITS = 10;
export const MAX_SCHOOL_PURCHASE_CREDITS = 100_000;

export type SchoolBalanceRow = {
  credits: number | null;
  trial_credits: number | null;
  trial_expires_at: string | null;
};

export type SchoolBalance = {
  /** Purchased credits; they do not expire. */
  paid: number;
  /** Trial credits still usable (0 once the trial has ended). */
  trial: number;
  total: number;
  trialExpiresAt: string | null;
  trialActive: boolean;
  low: boolean;
};

export function schoolBalance(row: SchoolBalanceRow, now: Date = new Date()): SchoolBalance {
  const paid = Math.max(0, row.credits ?? 0);
  const expires = row.trial_expires_at ? Date.parse(row.trial_expires_at) : NaN;
  const trialActive = Number.isFinite(expires) && expires > now.getTime() && (row.trial_credits ?? 0) > 0;
  const trial = trialActive ? Math.max(0, row.trial_credits ?? 0) : 0;
  const total = paid + trial;
  return {
    paid,
    trial,
    total,
    trialExpiresAt: trialActive ? row.trial_expires_at : null,
    trialActive,
    low: total < LOW_BALANCE_CREDITS,
  };
}

/** Whole days left until the trial ends, rounded up; null when there is no trial. */
export function trialDaysLeft(balance: SchoolBalance, now: Date = new Date()): number | null {
  if (!balance.trialActive || !balance.trialExpiresAt) return null;
  return Math.max(0, Math.ceil((Date.parse(balance.trialExpiresAt) - now.getTime()) / 86_400_000));
}

export function parsePurchaseCredits(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isInteger(n)) return null;
  if (n < MIN_SCHOOL_PURCHASE_CREDITS || n > MAX_SCHOOL_PURCHASE_CREDITS) return null;
  return n;
}

export type AiUsageRow = {
  category: string;
  quantity: number | string;
  reference_id: string;
  credits_charged?: number | null;
  refunded_at?: string | null;
};

export type AllowanceUsage = { used: number; free: number; overage: number };

export type AuthoringUsage = {
  visuals: AllowanceUsage;
  images: AllowanceUsage;
  /** Credits charged this month for visuals and images past the allowance (after refunds). */
  creditsCharged: number;
  creditsPerVisual: number;
  creditsPerImage: number;
};

/** The month's lesson visual/image usage against the free allowance, as the database counts it. */
export function summarizeAuthoringUsage(
  rows: AiUsageRow[],
  allowance: { free_interactive_allowance?: number | string | null; free_image_allowance?: number | string | null } | null,
): AuthoringUsage {
  const freeVisuals = Number(allowance?.free_interactive_allowance ?? DEFAULT_FREE_ALLOWANCE.visuals);
  const freeImages = Number(allowance?.free_image_allowance ?? DEFAULT_FREE_ALLOWANCE.images);
  let visuals = 0;
  let images = 0;
  let creditsCharged = 0;
  for (const row of rows) {
    if (row.refunded_at || row.reference_id.startsWith('creative-concept:')) continue;
    const quantity = Number(row.quantity) || 0;
    if (row.category === 'interactive_generation') visuals += quantity;
    else if (row.category === 'image_generation') images += quantity;
    else continue;
    creditsCharged += Number(row.credits_charged ?? 0) || 0;
  }
  return {
    visuals: { used: visuals, free: freeVisuals, overage: Math.max(0, visuals - freeVisuals) },
    images: { used: images, free: freeImages, overage: Math.max(0, images - freeImages) },
    creditsCharged,
    creditsPerVisual: AUTHORING_CREDITS.visual,
    creditsPerImage: AUTHORING_CREDITS.image,
  };
}

/** First moment of the current month in UTC, which is how the database buckets usage. */
export function monthStartUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export type LedgerRow = {
  transaction_type: string;
  usage_kind: string | null;
  credits: number;
};

/** Net credits (= minutes) spent per kind, after refunds. */
export function netUsageByKind(rows: LedgerRow[]): Record<'voice' | 'live_class' | 'visual' | 'image', number> {
  const totals = { voice: 0, live_class: 0, visual: 0, image: 0 };
  for (const row of rows) {
    if (row.transaction_type !== 'usage' && row.transaction_type !== 'refund') continue;
    const kind = row.usage_kind as keyof typeof totals | null;
    if (!kind || !(kind in totals)) continue;
    totals[kind] -= row.credits;
  }
  for (const key of Object.keys(totals) as Array<keyof typeof totals>) totals[key] = Math.max(0, totals[key]);
  return totals;
}

export function isSchoolManagerRole(role: string | null | undefined): boolean {
  return role === 'owner' || role === 'admin';
}
