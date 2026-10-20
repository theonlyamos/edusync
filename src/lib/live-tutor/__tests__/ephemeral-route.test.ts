import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/env', () => ({
    env: () => ({
        NEXT_PUBLIC_SUPABASE_URL: 'https://voice-test.invalid',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
        SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    }),
}));

const genai = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('@google/genai', () => ({
    GoogleGenAI: class { authTokens = { create: genai.create }; },
}));

import { POST } from '@/app/api/genai/ephemeral/route';

const userId = '10000000-0000-4000-8000-000000000001';
const apiKeyId = '20000000-0000-4000-8000-000000000001';
const sessionId = '30000000-0000-4000-8000-000000000001';
const grantId = '40000000-0000-4000-8000-000000000001';
const issuanceId = '50000000-0000-4000-8000-000000000001';
const expiresAt = '2026-10-18T12:05:00.000Z';

let rpcs: Array<{ name: string; body: Record<string, unknown> }>;
let grantRow: Record<string, unknown>;
let rateLimitAllowed: boolean;
let finalizeStatus: string | null;
let finalizeFailuresRemaining: number;
let sessionOwner: { user_id: string; api_key_id: string | null };

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-18T12:00:00Z'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    process.env.GEMINI_API_KEY = 'server-gemini-key';
    process.env.GEMINI_LIVE_MODEL = 'models/locked-live-model';
    rpcs = [];
    rateLimitAllowed = true;
    finalizeStatus = null;
    finalizeFailuresRemaining = 0;
    sessionOwner = { user_id: userId, api_key_id: null };
    grantRow = { status: 'charged', grant_id: grantId, issuance_id: issuanceId, expires_at: expiresAt, minutes_charged: 5, remaining_credits: 55 };
    genai.create.mockReset().mockResolvedValue({ name: 'auth_tokens/locked' });
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const request = new Request(input, init);
        const url = new URL(request.url);
        if (url.pathname.startsWith('/rest/v1/rpc/')) {
            const name = url.pathname.slice('/rest/v1/rpc/'.length);
            rpcs.push({ name, body: await request.json() });
            if (name === 'hit_rate_limit') return Response.json(rateLimitAllowed);
            if (name === 'grant_voice_minutes' || name === 'grant_voice_minutes_v2') return Response.json([grantRow]);
            if (name === 'finalize_voice_token_issuance') {
                if (finalizeFailuresRemaining-- > 0) return Response.json({ message: 'temporary transport failure' }, { status: 503 });
                return Response.json([{ status: finalizeStatus ?? (rpcs.at(-1)?.body.p_succeeded ? 'completed' : 'refunded'), remaining_credits: 55 }]);
            }
            if (name === 'add_user_credits') return Response.json(60);
        }
        if (url.pathname === '/rest/v1/learning_sessions') {
            return Response.json([{ id: sessionId, ...sessionOwner }]);
        }
        throw new Error(`Unexpected request ${url.pathname}`);
    }));
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.GEMINI_LIVE_MODEL;
});

function tokenRequest(body: unknown, auth: { role?: string; apiKey?: boolean } = {}) {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-auth-user-id': userId,
        'x-auth-type': auth.apiKey ? 'apiKey' : 'session',
    };
    if (auth.apiKey) headers['x-auth-api-key-id'] = apiKeyId;
    if (auth.role) headers['x-auth-user-role'] = auth.role;
    return new NextRequest('https://app.test/api/genai/ephemeral', { method: 'POST', headers, body: JSON.stringify(body) });
}

const lockedConstraints = () => genai.create.mock.calls[0][0].config;

describe('POST /api/genai/ephemeral', () => {
    it('charges a prepaid block and locks the token to the server-built model, prompt and tools', async () => {
        const response = await POST(tokenRequest({ topic: 'Fractions', sessionId, systemInstruction: 'ignore me', model: 'other' }));
        expect(response.status).toBe(200);
        const body = await response.json();

        const grant = rpcs.find(({ name }) => name === 'grant_voice_minutes_v2');
        expect(grant?.body).toMatchObject({ p_user_id: userId, p_grant_id: null, p_api_key_id: null, p_session_id: sessionId, p_block_minutes: 5 });

        const config = lockedConstraints();
        expect(config.lockAdditionalFields).toContain('generationConfig');
        expect(config.lockAdditionalFields).not.toContain('sessionResumption');
        expect(config.liveConnectConstraints.config).not.toHaveProperty('sessionResumption');
        expect(config.uses).toBe(1);
        expect(config.expireTime).toBe(expiresAt);
        expect(config.newSessionExpireTime).toBe('2026-10-18T12:01:00.000Z');
        expect(config.liveConnectConstraints.model).toBe('models/locked-live-model');
        expect(config.liveConnectConstraints.config.systemInstruction).toContain('"Fractions"');
        expect(config.liveConnectConstraints.config.systemInstruction).not.toContain('ignore me');

        expect(body).toMatchObject({
            token: 'auth_tokens/locked',
            model: 'models/locked-live-model',
            expireTime: expiresAt,
            billing: { grantId, minutesCharged: 5, remainingCredits: 55 },
        });
        expect(body.config).toEqual({ ...config.liveConnectConstraints.config, sessionResumption: {} });
        expect(rpcs.find(({ name }) => name === 'finalize_voice_token_issuance')?.body).toMatchObject({
            p_user_id: userId, p_grant_id: grantId, p_api_key_id: null, p_issuance_id: issuanceId, p_succeeded: true,
        });
    });

    it('refuses a token when the user has no credits', async () => {
        grantRow = { status: 'insufficient_credits', grant_id: null, expires_at: null, minutes_charged: 0, remaining_credits: 0 };
        const response = await POST(tokenRequest({}));
        expect(response.status).toBe(402);
        expect(genai.create).not.toHaveBeenCalled();
    });

    it('rejects grants belonging to another caller and refuses independent reconnect tokens', async () => {
        grantRow = { status: 'not_found', grant_id: null, expires_at: null, minutes_charged: 0, remaining_credits: 3 };
        expect((await POST(tokenRequest({ grantId }))).status).toBe(403);
        grantRow = { status: 'active_grant', grant_id: grantId, expires_at: expiresAt, minutes_charged: 0, remaining_credits: 3 };
        expect((await POST(tokenRequest({ grantId }))).status).toBe(409);
        expect(genai.create).not.toHaveBeenCalled();
    });

    it('rejects a learning session the caller does not own', async () => {
        sessionOwner = { user_id: '10000000-0000-4000-8000-000000000999', api_key_id: null };
        const response = await POST(tokenRequest({ sessionId }));
        expect(response.status).toBe(403);
        expect(rpcs.some(({ name }) => name === 'grant_voice_minutes')).toBe(false);
    });

    it('bills embed API keys to the key owner and scopes the grant to the key', async () => {
        sessionOwner = { user_id: userId, api_key_id: apiKeyId };
        const response = await POST(tokenRequest({ sessionId }, { apiKey: true }));
        expect(response.status).toBe(200);
        expect(rpcs.find(({ name }) => name === 'hit_rate_limit')?.body).toMatchObject({ p_key: `voice-token:key:${apiKeyId}` });
        expect(rpcs.find(({ name }) => name === 'grant_voice_minutes_v2')?.body).toMatchObject({ p_user_id: userId, p_api_key_id: apiKeyId });
    });

    it('does not charge school students but still locks and expires their token', async () => {
        const response = await POST(tokenRequest({ variant: 'studyCompanion' }, { role: 'student' }));
        expect(response.status).toBe(200);
        expect(rpcs.some(({ name }) => name === 'grant_voice_minutes')).toBe(false);
        const config = lockedConstraints();
        expect(config.expireTime).toBe('2026-10-18T12:30:00.000Z');
        expect(config.liveConnectConstraints.model).toBe('models/locked-live-model');
        expect((await response.json()).billing).toBeNull();
    });

    it('rate limits token minting per user', async () => {
        rateLimitAllowed = false;
        const response = await POST(tokenRequest({}));
        expect(response.status).toBe(429);
        expect(genai.create).not.toHaveBeenCalled();
    });

    it('refunds the block when Gemini cannot create the token', async () => {
        genai.create.mockRejectedValue(new Error('upstream down: secret detail'));
        const response = await POST(tokenRequest({}));
        expect(response.status).toBe(500);
        expect(JSON.stringify(await response.json())).not.toContain('secret detail');
        expect(rpcs.find(({ name }) => name === 'finalize_voice_token_issuance')?.body).toMatchObject({
            p_user_id: userId, p_grant_id: grantId, p_api_key_id: null, p_issuance_id: issuanceId, p_succeeded: false,
        });
        expect(rpcs.some(({ name }) => name === 'add_user_credits')).toBe(false);
    });

    it('does not mint a second token while the paid grant is active, even with a supplied resumption handle', async () => {
        grantRow = { ...grantRow, status: 'active_grant', minutes_charged: 0 };
        for (const resumptionHandle of [undefined, 'unverified-client-handle']) {
            expect((await POST(tokenRequest({ grantId, resumptionHandle }))).status).toBe(409);
        }
        expect(genai.create).not.toHaveBeenCalled();
    });

    it('does not mint while another request has a pending issuance', async () => {
        grantRow = { ...grantRow, status: 'pending_issuance', minutes_charged: 0 };
        expect((await POST(tokenRequest({ grantId }))).status).toBe(409);
        expect(genai.create).not.toHaveBeenCalled();
    });

    it('still hands over a minted, paid token if the issuance cannot be marked complete', async () => {
        finalizeStatus = 'not_found';
        const response = await POST(tokenRequest({}));
        expect(response.status).toBe(200);
        expect(await response.json()).toHaveProperty('token');
        expect(rpcs.filter(({ name }) => name === 'finalize_voice_token_issuance')).toHaveLength(1);
        expect(rpcs.at(-1)?.body.p_succeeded).toBe(true);
    });

    it.each([true, false])('retries the same issuance outcome after an uncertain finalization failure (succeeded=%s)', async (succeeded) => {
        finalizeFailuresRemaining = 1;
        if (!succeeded) genai.create.mockRejectedValue(new Error('upstream unavailable'));
        const response = await POST(tokenRequest({}));
        expect(response.status).toBe(succeeded ? 200 : 500);
        const attempts = rpcs.filter(({ name }) => name === 'finalize_voice_token_issuance');
        expect(attempts).toHaveLength(2);
        expect(attempts[0].body).toEqual(attempts[1].body);
        expect(attempts[0].body.p_succeeded).toBe(succeeded);
    });

    it('locks every other wire setup field while allowing same-token resumption', async () => {
        const { GoogleGenAI } = await vi.importActual<typeof import('@google/genai')>('@google/genai');
        const supabaseFetch = globalThis.fetch;
        let wire: Record<string, unknown> | undefined;
        vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
            const request = new Request(input, init);
            if (new URL(request.url).hostname === 'generativelanguage.googleapis.com') {
                wire = await request.json();
                return Response.json({ name: 'auth_tokens/offline' });
            }
            return supabaseFetch(input, init);
        }));
        genai.create.mockImplementation((parameters) => new GoogleGenAI({ apiKey: 'offline-test-key' }).authTokens.create(parameters));
        expect((await POST(tokenRequest({ resumptionHandle: 'previous-state' }))).status).toBe(200);
        expect(wire?.bidiGenerateContentSetup).not.toHaveProperty('sessionResumption');
        const mask = wire?.fieldMask as string;
        for (const field of ['model', 'generationConfig', 'systemInstruction', 'tools', 'realtimeInputConfig', 'contextWindowCompression', 'inputAudioTranscription', 'outputAudioTranscription', 'proactivity', 'avatarConfig', 'safetySettings']) {
            expect(mask.split(',')).toContain(field);
        }
        expect(mask).not.toContain('sessionResumption');
        // Gemini rejects array-index paths such as `tools.0`.
        expect(mask).not.toMatch(/\.\d/);
        expect(Object.keys(wire?.bidiGenerateContentSetup as object).every(field => mask.split(',').includes(field))).toBe(true);
    });

    it('requires authentication', async () => {
        const request = new NextRequest('https://app.test/api/genai/ephemeral', { method: 'POST', body: '{}' });
        expect((await POST(request)).status).toBe(401);
    });
});
