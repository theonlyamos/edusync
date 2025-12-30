import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function addSecurityHeaders(response: NextResponse, request?: NextRequest): NextResponse {
    const pathname = request?.nextUrl?.pathname || '';

    // Check for different embed routes
    // /embed/[id] - embeddable on any website (for public sharing)
    // /embed/new - same-origin only
    const isEmbedWithId = pathname.match(/^\/embed\/[^/]+$/);

    // Content Security Policy - configure frame-ancestors based on route
    let frameAncestors: string;
    if (isEmbedWithId) {
        // Allow embedding on any website for /embed/[id]
        frameAncestors = "frame-ancestors *";
    } else {
        // No embedding allowed for other routes
        frameAncestors = "frame-ancestors 'none'";
    }

    const csp = [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://unpkg.com https://cdn.supabase.io https://va.vercel-scripts.com https://esm.sh",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com",
        "style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: blob: https: https://images.unsplash.com",
        "media-src 'self' blob: https://*.supabase.co",
        "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://generativelanguage.googleapis.com wss://generativelanguage.googleapis.com https://vitals.vercel-insights.com https://cdn.jsdelivr.net https://esm.sh",
        frameAncestors,
        "base-uri 'self'",
        "form-action 'self'",
        "upgrade-insecure-requests"
    ].join('; ');

    response.headers.set('Content-Security-Policy', csp);
    response.headers.set('X-Content-Type-Options', 'nosniff');

    if (isEmbedWithId) {
        response.headers.delete('X-Frame-Options');
    } else {
        response.headers.set('X-Frame-Options', 'DENY');
    }

    response.headers.set('X-XSS-Protection', '1; mode=block');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.headers.set('Permissions-Policy', 'geolocation=(), microphone=(*), camera=()');

    if (process.env.NODE_ENV === 'production') {
        response.headers.set(
            'Strict-Transport-Security',
            'max-age=31536000; includeSubDomains; preload'
        );
    }

    return response;
}

export function configureCORS(request: NextRequest, response: NextResponse): NextResponse {
    const origin = request.headers.get('origin');
    const pathname = request.nextUrl?.pathname || '';

    // For embed routes, allow any origin for public embedding
    const isEmbedWithId = pathname.match(/^\/embed\/[^/]+$/) && pathname !== '/embed/new';

    if (isEmbedWithId && origin) {
        // Allow any origin for public embed routes
        response.headers.set('Access-Control-Allow-Origin', origin);
        response.headers.set('Access-Control-Allow-Credentials', 'true');
    } else {
        // Define allowed origins for non-embed routes
        const allowedOrigins = [
            process.env.NEXT_PUBLIC_BASE_URL,
            'http://localhost:3000',
            'http://localhost:3001',
        ].filter(Boolean);

        // Check if origin is allowed
        if (origin && allowedOrigins.includes(origin)) {
            response.headers.set('Access-Control-Allow-Origin', origin);
            response.headers.set('Access-Control-Allow-Credentials', 'true');
        }
    }

    // Handle preflight requests
    if (request.method === 'OPTIONS') {
        response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        response.headers.set(
            'Access-Control-Allow-Headers',
            'Content-Type, Authorization, X-Requested-With'
        );
        response.headers.set('Access-Control-Max-Age', '86400');
    }

    return response;
}
