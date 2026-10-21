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

        // Every token is paid for: school members from their school's credit
        // pool, everyone else (and embed API keys) from their own credits.
        // The database decides which pool (grant_voice_minutes_v2).
        const now = Date.now();
        const grant = await grantVoiceMinutes({
            userId: auth.userId,
            apiKeyId,
            grantId: input.grantId ?? null,
            sessionId,
        });
        if (grant.status === 'insufficient_credits') {
            return NextResponse.json(
                {
                    error: grant.payer === 'school' ? 'Your school is out of credits' : 'Insufficient credits',
                    remainingCredits: grant.remainingCredits,
                    payer: grant.payer,
                },
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
        const expireTime = grant.expiresAt;
        const issuance = { grantId: grant.grantId, issuanceId: grant.issuanceId };
        const billing = {
            grantId: grant.grantId,
            minutesCharged: grant.minutesCharged,
            remainingCredits: grant.remainingCredits,
            payer: grant.payer,
        };

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
                    httpOptions: {
                        apiVersion: 'v1alpha',
                        // Bounded so a hung request can't outlive the stale-issuance window in the database.
                        timeout: 30_000,
                        // The SDK derives the mask from the setup and writes the tools array as
                        // `tools.0,tools.1`, which Gemini rejects. Every setup field we send is in
                        // this list, so locking the whole top-level fields is the same lock, spelled validly.
                        extraBody: { fieldMask: LOCKED_SETUP_FIELDS.join(',') },
                    },
                },
            });
            tokenName = token.name;
            if (!tokenName) throw new Error('Gemini returned a token without a name');
        } catch (error) {
            try {
                await finalizeVoiceTokenIssuance({ ...issuance, userId: auth.userId, apiKeyId, succeeded: false });
            } catch (refundError) {
                console.error('Failed to roll back voice token issuance:', refundError);
            }
            throw error;
        }

        // The token exists and the block is paid for, so hand it over even if
        // marking the issuance complete fails. The database clears a stale
        // pending issuance on the next request for this grant.
        try {
            await finalizeVoiceTokenIssuance({ ...issuance, userId: auth.userId, apiKeyId, succeeded: true });
        } catch (finalizeError) {
            console.error('Failed to mark voice token issuance complete:', finalizeError);
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
