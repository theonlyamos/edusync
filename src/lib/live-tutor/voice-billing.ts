import { createServerSupabase } from '@/lib/supabase.server';

/**
 * Server-side billing for Gemini Live voice time (see migration
 * 20261018105346_voice_session_grants.sql).
 *
 * The browser talks to Gemini directly, so the server never sees the audio.
 * What it does control is how long each token works. Every billed token is
 * backed by a prepaid block of minutes and expires when that block ends; the
 * client renews shortly before then, which charges the next block.
 */

const DEFAULT_BLOCK_MINUTES = 5;
const MAX_BLOCK_MINUTES = 10;

/** A renewal is only accepted this close to the end of the paid block. */
export const VOICE_RENEW_WINDOW_SECONDS = 90;
export const VOICE_MAX_TOKENS_PER_BLOCK = 1;

export function voiceBlockMinutes(): number {
    const raw = Number.parseInt(process.env.VOICE_BILLING_BLOCK_MINUTES ?? '', 10);
    if (!Number.isFinite(raw) || raw < 1) return DEFAULT_BLOCK_MINUTES;
    return Math.min(raw, MAX_BLOCK_MINUTES);
}

/** Whose credits paid: the person's school pool, or their own (or the API key owner's) credits. */
export type VoicePayer = 'school' | 'personal';

export type VoiceGrantResult =
    | { status: 'charged'; grantId: string; issuanceId: string; expiresAt: Date; minutesCharged: number; remainingCredits: number; payer: VoicePayer }
    | { status: 'insufficient_credits'; remainingCredits: number; payer: VoicePayer }
    | { status: 'not_found' }
    | { status: 'active_grant' }
    | { status: 'pending_issuance' };

async function voicePayerSchoolId(supabase: ReturnType<typeof createServerSupabase>, userId: string): Promise<string | null> {
    const { data, error } = await supabase.rpc('user_school_id', { p_user_id: userId });
    if (error) {
        console.error('user_school_id lookup failed:', error.message);
        return null;
    }
    return typeof data === 'string' && data ? data : null;
}

export async function grantVoiceMinutes(input: {
    userId: string;
    apiKeyId: string | null;
    grantId: string | null;
    sessionId: string | null;
}): Promise<VoiceGrantResult> {
    const supabase = createServerSupabase();
    const { data, error } = await supabase.rpc('grant_voice_minutes_v2', {
        p_user_id: input.userId,
        p_grant_id: input.grantId,
        p_api_key_id: input.apiKeyId,
        p_session_id: input.sessionId,
        p_block_minutes: voiceBlockMinutes(),
        p_renew_window_seconds: VOICE_RENEW_WINDOW_SECONDS,
        p_max_tokens_per_block: VOICE_MAX_TOKENS_PER_BLOCK,
    });
    if (error) throw new Error(`grant_voice_minutes_v2 failed: ${error.message}`);

    const row = (Array.isArray(data) ? data[0] : data) as {
        status: string;
        grant_id: string | null;
        issuance_id: string | null;
        expires_at: string | null;
        minutes_charged: number | null;
        remaining_credits: number | null;
    } | null;
    if (!row) throw new Error('grant_voice_minutes returned no row');
    // Same rule the database used to pick the pool: signed-in school members pay from their school.
    const payer: VoicePayer = !input.apiKeyId && (row.status === 'charged' || row.status === 'insufficient_credits')
        && (await voicePayerSchoolId(supabase, input.userId)) ? 'school' : 'personal';

    switch (row.status) {
        case 'charged':
            if (!row.grant_id || !row.issuance_id || !row.expires_at) throw new Error('grant_voice_minutes_v2 returned an incomplete grant');
            return {
                status: row.status,
                grantId: row.grant_id,
                issuanceId: row.issuance_id,
                expiresAt: new Date(row.expires_at),
                minutesCharged: row.minutes_charged ?? 0,
                remainingCredits: row.remaining_credits ?? 0,
                payer,
            };
        case 'insufficient_credits':
            return { status: 'insufficient_credits', remainingCredits: row.remaining_credits ?? 0, payer };
        case 'not_found':
            return { status: 'not_found' };
        case 'active_grant':
        case 'pending_issuance':
            return { status: row.status };
        default:
            throw new Error(`grant_voice_minutes returned unknown status ${row.status}`);
    }
}

export async function finalizeVoiceTokenIssuance(input: {
    userId: string;
    apiKeyId: string | null;
    grantId: string;
    issuanceId: string;
    succeeded: boolean;
}): Promise<void> {
    const supabase = createServerSupabase();
    const parameters = {
        p_user_id: input.userId,
        p_grant_id: input.grantId,
        p_api_key_id: input.apiKeyId,
        p_issuance_id: input.issuanceId,
        p_succeeded: input.succeeded,
    };
    for (let attempt = 0; attempt < 2; attempt++) {
        let result;
        try {
            result = await supabase.rpc('finalize_voice_token_issuance', parameters);
        } catch (error) {
            if (attempt === 0) continue;
            throw error;
        }
        const { data, error } = result;
        if (error) {
            if (attempt === 0) continue;
            throw new Error(`finalize_voice_token_issuance failed: ${error.message}`);
        }
        const row = (Array.isArray(data) ? data[0] : data) as { status: string } | null;
        if (row?.status !== (input.succeeded ? 'completed' : 'refunded')) {
            throw new Error(`finalize_voice_token_issuance returned ${row?.status ?? 'no row'}`);
        }
        return;
    }
}

/**
 * Durable limit on token minting (shared across serverless instances), per
 * signed-in user, or per embed API key since many learners share one key.
 * Returns false when the limit is hit or cannot be checked.
 */
export async function allowVoiceTokenRequest(subject: { userId: string; apiKeyId: string | null }): Promise<boolean> {
    const key = subject.apiKeyId ? `voice-token:key:${subject.apiKeyId}` : `voice-token:user:${subject.userId}`;
    const max = subject.apiKeyId ? 600 : 30;
    try {
        const supabase = createServerSupabase();
        const { data, error } = await supabase.rpc('hit_rate_limit', {
            p_key: key,
            p_max: max,
            p_window_seconds: 600,
        });
        if (error) {
            console.error('voice token rate limit check failed:', error.message);
            return false;
        }
        return data === true;
    } catch (err) {
        console.error('voice token rate limit unavailable:', err);
        return false;
    }
}
