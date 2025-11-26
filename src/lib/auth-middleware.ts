import { NextRequest, NextResponse } from 'next/server';
import { getServerSession, type CookieAdapter } from '@/lib/auth';
import { validateApiKey } from '@/lib/api-key-auth';

export interface AuthContext {
    userId: string;
    userEmail: string;
    userRole: string | null;
    authType: 'session' | 'apiKey';
    apiKeyId?: string;
}

export async function authenticateRequest(
    request: NextRequest,
    response: NextResponse
): Promise<{ authorized: boolean; authContext?: AuthContext; error?: string }> {
    const adapter: CookieAdapter = {
        getAll: () => request.cookies.getAll().map(({ name, value }) => ({ name, value })),
        setAll: (cookiesToSet) => {
            cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
    };

    const session = await getServerSession(adapter);

    if (session?.user) {
        return {
            authorized: true,
            authContext: {
                userId: session.user.id,
                userEmail: session.user.email,
                userRole: session.user.role,
                authType: 'session',
            },
        };
    }

    const apiKeyValidation = await validateApiKey(request);


    if (apiKeyValidation.valid && apiKeyValidation.userId) {
        return {
            authorized: true,
            authContext: {
                userId: apiKeyValidation.userId,
                userEmail: apiKeyValidation.apiKeyData?.name || 'API Key User',
                userRole: null,
                authType: 'apiKey',
                apiKeyId: apiKeyValidation.apiKeyId,
            },
        };
    }

    return {
        authorized: false,
        error: 'Unauthorized. Please provide valid authentication.',
    };
}

export function setAuthHeaders(response: NextResponse, authContext: AuthContext): NextResponse {
    response.headers.set('x-auth-user-id', authContext.userId);
    response.headers.set('x-auth-type', authContext.authType);
    if (authContext.apiKeyId) {
        response.headers.set('x-auth-api-key-id', authContext.apiKeyId);
    }
    if (authContext.userRole) {
        response.headers.set('x-auth-user-role', authContext.userRole);
    }
    return response;
}

export type ApiAuthMode = 'session' | 'apiKey' | 'both' | 'none';

export const API_AUTH_CONFIG: Record<string, ApiAuthMode> = {
    '/api/embed/keys': 'session',
    '/api/embed/keys/*': 'session',
    '/api/embed/sessions': 'apiKey',
    '/api/embed/sessions/*': 'apiKey',
    '/api/embed/credits/*': 'apiKey',
    '/api/genai/visualize': 'both',
    '/api/genai/ephemeral': 'both',
    '/api/learning/sessions': 'both',
    '/api/learning/sessions/*/recordings': 'both',
    '/api/learning/sessions/*/recordings/*': 'both',
    '/api/learning/sessions/*': 'both',
    '/api/learning/visualizations': 'both',
    '/api/learning/visualizations/*': 'both',
    '/api/credits/deduct-minute': 'both',
    '/api/credits/*': 'both',
    '/api/sessions': 'both',
    '/api/feedback': 'none',
    '/api/auth/*': 'none',
};

export function getAuthModeForPath(pathname: string): ApiAuthMode {
    for (const [pattern, mode] of Object.entries(API_AUTH_CONFIG)) {
        if (pattern.includes('*')) {
            const regex = new RegExp('^' + pattern.replace(/\*/g, '[^/]+') + '$');
            if (regex.test(pathname)) {
                return mode;
            }
        } else if (pathname === pattern) {
            return mode;
        }
    }

    return 'session';
}

