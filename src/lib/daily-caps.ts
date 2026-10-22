import 'server-only';
import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase.server';

/** Free daily allowance per student for each AI study tool. */
export const DAILY_CAPS = {
  companion: { max: 60, noun: 'study companion messages' },
  practice: { max: 10, noun: 'practice sets' },
  collaborator: { max: 10, noun: 'collaborator images' },
} as const;

export type DailyCapFeature = keyof typeof DAILY_CAPS;

const DAY_SECONDS = 24 * 60 * 60;

/** One counter per student, tool and UTC day, e.g. "daily:practice:<user>:2026-10-22". */
export function dailyCapKey(feature: DailyCapFeature, userId: string, now: Date = new Date()): string {
  return `daily:${feature}:${userId}:${now.toISOString().slice(0, 10)}`;
}

export function dailyCapMessage(feature: DailyCapFeature): string {
  const cap = DAILY_CAPS[feature];
  return `You've used today's ${cap.max} ${cap.noun}. Great work! They reset tomorrow.`;
}

/**
 * Counts one use and returns a friendly 429 response once the student is over
 * today's cap, or null when the request may go ahead. Fails open if the
 * counter can't be reached, so a database hiccup never blocks studying.
 */
export async function enforceDailyCap(feature: DailyCapFeature, userId: string): Promise<NextResponse | null> {
  try {
    const { data, error } = await createServerSupabase().rpc('hit_rate_limit', {
      p_key: dailyCapKey(feature, userId),
      p_max: DAILY_CAPS[feature].max,
      // The date in the key starts a fresh counter each day; the window only
      // needs to outlast it.
      p_window_seconds: DAY_SECONDS,
    });
    if (error) {
      console.error(`[daily-cap:${feature}]`, error.message);
      return null;
    }
    if (data === false) {
      const message = dailyCapMessage(feature);
      return NextResponse.json({ error: message, message, code: 'daily_cap_reached' }, { status: 429 });
    }
    return null;
  } catch (error) {
    console.error(`[daily-cap:${feature}]`, error);
    return null;
  }
}
