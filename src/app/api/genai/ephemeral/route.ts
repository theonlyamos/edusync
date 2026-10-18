import { GoogleGenAI } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/get-auth-context';
import { createServerSupabase } from '@/lib/supabase.server';
import {
    buildLiveConnectConfig,
    getLiveModel,
    liveTokenRequestSchema,
} from '@/lib/live-tutor/live-connect-config';
import { allowVoiceTokenRequest, finalizeVoiceTokenIssuance, grantVoiceMinutes } from '@/lib/live-tutor/voice-billing';

/** Students using their school's tutor are not charged credits; tokens still expire. */
const UNBILLED_TOKEN_MINUTES = 30;
/** A token must open its Live session within this window. */
const NEW_SESSION_WINDOW_MS = 60 * 1000;

const LOCKED_SETUP_FIELDS = [
    'model',
    'generationConfig',
    'systemInstruction',
    'tools',
    'realtimeInputConfig',
    'contextWindowCompression',
    'inputAudioTranscription',
    'outputAudioTranscription',
    'proactivity',
    'avatarConfig',
    'safetySettings',
];

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
        let issuance: { grantId: string; issuanceId: string } | null = null;

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
            if (grant.status === 'active_grant' || grant.status === 'pending_issuance') {
                return NextResponse.json(
                    { error: grant.status === 'active_grant' ? 'Resume with the existing voice token' : 'Voice token issuance is already pending' },
                    { status: 409 },
                );
            }
            expireTime = grant.expiresAt;
            issuance = { grantId: grant.grantId, issuanceId: grant.issuanceId };
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
        const constrainedConfig = { ...config };
        Reflect.deleteProperty(constrainedConfig, 'sessionResumption');

        let tokenName: string | undefined;
        try {
            const ai = new GoogleGenAI({ apiKey });
            const token = await ai.authTokens.create({
                config: {
                    uses: 1,
                    expireTime: expireTime.toISOString(),
                    newSessionExpireTime: newSessionExpireTime.toISOString(),
                    liveConnectConstraints: { model, config: constrainedConfig as never },
                    lockAdditionalFields: LOCKED_SETUP_FIELDS,
                    httpOptions: { apiVersion: 'v1alpha' },
                },
            });
            tokenName = token.name;
            if (!tokenName) throw new Error('Gemini returned a token without a name');
        } catch (error) {
            if (issuance) {
                try {
                    await finalizeVoiceTokenIssuance({ ...issuance, userId: auth.userId, apiKeyId, succeeded: false });
                } catch (refundError) {
                    console.error('Failed to roll back voice token issuance:', refundError);
                }
            }
            throw error;
        }

        if (issuance) {
            await finalizeVoiceTokenIssuance({ ...issuance, userId: auth.userId, apiKeyId, succeeded: true });
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
