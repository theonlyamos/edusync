import { GoogleGenAI } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/get-auth-context';
import { createServerSupabase } from '@/lib/supabase.server';
import { addCredits } from '@/lib/credits';
import {
    buildLiveConnectConfig,
    getLiveModel,
    liveTokenRequestSchema,
} from '@/lib/live-tutor/live-connect-config';
import { allowVoiceTokenRequest, grantVoiceMinutes } from '@/lib/live-tutor/voice-billing';

/** Students using their school's tutor are not charged credits; tokens still expire. */
const UNBILLED_TOKEN_MINUTES = 30;
/** A token must open its Live session within this window. */
const NEW_SESSION_WINDOW_MS = 60 * 1000;

async function ownsLearningSession(
    sessionId: string,
    userId: string,
    apiKeyId: string | null,
): Promise<boolean> {
    const supabase = createServerSupabase();
    const { data } = await supabase
        .from('learning_sessions')
        .select('id, user_id, api_key_id')
        .eq('id', sessionId)
        .maybeSingle();
    if (!data) return false;
    if (apiKeyId) return data.api_key_id === apiKeyId;
    return data.user_id === userId;
}

export async function POST(request: NextRequest) {
    const auth = getAuthContext(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const apiKey = process.env.GEMINI_API_KEY;
    const model = getLiveModel();
    if (!apiKey || !model) {
        console.error('Voice tutor is not configured: GEMINI_API_KEY or GEMINI_LIVE_MODEL is missing');
        return NextResponse.json({ error: 'Voice tutor is not configured' }, { status: 500 });
    }

    const rawBody = await request.text();
    let body: unknown = {};
    if (rawBody.trim()) {
        try {
            body = JSON.parse(rawBody);
        } catch {
            return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
        }
    }
    const parsed = liveTokenRequestSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: 'Invalid voice session request' }, { status: 400 });
    }
    const input = parsed.data;
    const apiKeyId = auth.authType === 'apiKey' ? auth.apiKeyId ?? null : null;

    if (!(await allowVoiceTokenRequest({ userId: auth.userId, apiKeyId }))) {
        return NextResponse.json(
            { error: 'Too many voice connections. Please wait a few minutes and try again.' },
            { status: 429 },
        );
    }

    try {
        let sessionId: string | null = null;
        if (input.sessionId) {
            if (!(await ownsLearningSession(input.sessionId, auth.userId, apiKeyId))) {
                return NextResponse.json({ error: 'Session not found' }, { status: 403 });
            }
            sessionId = input.sessionId;
        }

        const billed = !(auth.authType === 'session' && auth.userRole === 'student');
        const now = Date.now();
        let expireTime: Date;
        let billing: { grantId: string; minutesCharged: number; remainingCredits: number } | null = null;

        if (billed) {
            const grant = await grantVoiceMinutes({
                userId: auth.userId,
                apiKeyId,
                grantId: input.grantId ?? null,
                sessionId,
            });
            if (grant.status === 'insufficient_credits') {
                return NextResponse.json(
                    { error: 'Insufficient credits', remainingCredits: grant.remainingCredits },
                    { status: 402 },
                );
            }
            if (grant.status === 'not_found') {
                return NextResponse.json({ error: 'Voice session not found' }, { status: 403 });
            }
            if (grant.status === 'too_many_reconnects') {
                return NextResponse.json(
                    { error: 'Too many reconnects for this voice session. Please start a new session.' },
                    { status: 429 },
                );
            }
            expireTime = grant.expiresAt;
            billing = {
                grantId: grant.grantId,
                minutesCharged: grant.minutesCharged,
                remainingCredits: grant.remainingCredits,
            };
        } else {
            expireTime = new Date(now + UNBILLED_TOKEN_MINUTES * 60 * 1000);
        }

        const newSessionExpireTime = new Date(Math.min(now + NEW_SESSION_WINDOW_MS, expireTime.getTime()));
        const config = buildLiveConnectConfig(input);

        let tokenName: string | undefined;
        try {
            const ai = new GoogleGenAI({ apiKey });
            // liveConnectConstraints without lockAdditionalFields locks every
            // setup field: the token cannot be used with another model,
            // system prompt, tool set or resumption handle.
            const token = await ai.authTokens.create({
                config: {
                    uses: 1,
                    expireTime: expireTime.toISOString(),
                    newSessionExpireTime: newSessionExpireTime.toISOString(),
                    liveConnectConstraints: { model, config: config as never },
                    httpOptions: { apiVersion: 'v1alpha' },
                },
            });
            tokenName = token.name;
            if (!tokenName) throw new Error('Gemini returned a token without a name');
        } catch (error) {
            if (billing && billing.minutesCharged > 0) {
                const refund = await addCredits(
                    auth.userId,
                    billing.minutesCharged,
                    'Refund: voice session could not be started',
                    'refund',
                );
                if (!refund.success) console.error('Failed to refund voice minutes:', refund.error);
            }
            throw error;
        }

        return NextResponse.json({
            token: tokenName,
            model,
            config,
            expireTime: expireTime.toISOString(),
            newSessionExpireTime: newSessionExpireTime.toISOString(),
            billing,
        });
    } catch (error) {
        console.error('Failed to create ephemeral token:', error);
        return NextResponse.json({ error: 'Failed to create voice session token' }, { status: 500 });
    }
}
