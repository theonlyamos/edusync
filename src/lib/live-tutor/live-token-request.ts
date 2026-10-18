import { VoiceTokenRequestError } from '@/lib/audio/ephemeral-token-error';

/**
 * Browser-side body for POST /api/genai/ephemeral. The server builds and locks
 * the Gemini Live config from these fields (see live-connect-config.ts), so the
 * browser never chooses the model, the system prompt or the tools.
 */

export type LiveTokenRequestInput = {
    grantId: string | null;
    sessionId: string | null;
    resumptionHandle: string | null;
    variant: 'tutor' | 'studyCompanion';
    topic?: string | null;
    gradeLevel?: string | null;
    studyMode?: string | null;
    studyIntent?: string | null;
    lesson?: {
        title?: string;
        subject?: string;
        gradeLevel?: string;
        objectives?: string | string[];
        content?: string;
        learningRunId?: string;
        activeObjective?: { text: string };
    };
};

export type LiveTokenResponse = {
    token: string;
    model: string;
    config: Record<string, unknown>;
    expireTime: string;
    newSessionExpireTime: string;
    billing: { grantId: string; minutesCharged: number; remainingCredits: number } | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const clip = (value: string | null | undefined, max: number) =>
    typeof value === 'string' && value.length > 0 ? value.slice(0, max) : null;

export function buildLiveTokenRequest(input: LiveTokenRequestInput) {
    const lesson = input.lesson;
    return {
        grantId: input.grantId && UUID_RE.test(input.grantId) ? input.grantId : null,
        sessionId: input.sessionId && UUID_RE.test(input.sessionId) ? input.sessionId : null,
        resumptionHandle: clip(input.resumptionHandle, 4096),
        variant: input.variant,
        topic: clip(input.topic, 300),
        gradeLevel: clip(input.gradeLevel, 80),
        studyMode: input.studyMode ?? null,
        studyIntent: input.studyIntent ?? null,
        lesson: lesson
            ? {
                title: clip(lesson.title, 300),
                subject: clip(lesson.subject, 200),
                gradeLevel: clip(lesson.gradeLevel, 80),
                objectives: Array.isArray(lesson.objectives)
                    ? lesson.objectives.slice(0, 40).map((objective) => String(objective).slice(0, 1000))
                    : clip(lesson.objectives, 6000),
                // The prompt uses the first 2000 characters; one more tells it to add "...".
                content: clip(lesson.content, 2001),
                learningRunId: clip(lesson.learningRunId, 100),
                activeObjectiveText: clip(lesson.activeObjective?.text, 1000),
            }
            : null,
    };
}

/** When to ask for the next token: shortly before the current one stops working. */
export const LIVE_TOKEN_RENEW_LEAD_MS = 60 * 1000;

export function liveTokenRenewDelay(expireTime: string, now = Date.now()): number | null {
    const expiresAt = Date.parse(expireTime);
    if (!Number.isFinite(expiresAt)) return null;
    return Math.max(5_000, expiresAt - now - LIVE_TOKEN_RENEW_LEAD_MS);
}

/** Wait between renewal attempts that failed for a passing reason. */
export const LIVE_TOKEN_RENEW_RETRY_MS = 10 * 1000;

/**
 * Whether a failed renewal is worth retrying before the paid block ends.
 * Running out of credits, losing access or hitting the rate limit is final;
 * a network error, a server error or a 409 (the server still sees the
 * current block as active, for example after clock drift) is not.
 */
export function isRetryableRenewalError(error: unknown): boolean {
    if (!(error instanceof VoiceTokenRequestError)) return true;
    return ![401, 402, 403, 429].includes(error.status);
}
