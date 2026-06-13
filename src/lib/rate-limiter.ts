import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Hybrid rate limiter:
// - Strict, low-volume buckets (auth/upload/admin) use a durable fixed-window
//   counter in Postgres (hit_rate_limit, migration 0032) so limits hold across
//   serverless instances and cold starts.
// - High-volume buckets (api/tutor) stay in-memory as a best-effort guard to
//   avoid a DB round-trip on every request.

interface RateLimitEntry {
    count: number;
    resetTime: number;
}

class RateLimiter {
    private store: Map<string, RateLimitEntry> = new Map();
    private readonly points: number;
    private readonly duration: number; // in seconds
    private readonly blockDuration: number; // in seconds

    private cleanupTimer: ReturnType<typeof setInterval> | null = null;

    constructor(points: number, duration: number, blockDuration: number) {
        this.points = points;
        this.duration = duration * 1000; // Convert to milliseconds
        this.blockDuration = blockDuration * 1000; // Convert to milliseconds
    }

    // Lazily started so importing this module (e.g. in tests) doesn't leak timers.
    private ensureCleanup() {
        if (this.cleanupTimer) return;
        this.cleanupTimer = setInterval(() => this.cleanup(), 60000);
        // Don't keep the process alive just for cleanup (no-op in edge runtimes).
        if (typeof this.cleanupTimer === 'object' && 'unref' in this.cleanupTimer) {
            this.cleanupTimer.unref();
        }
    }

    private cleanup() {
        const now = Date.now();
        const keysToDelete: string[] = [];

        this.store.forEach((entry, key) => {
            if (entry.resetTime < now) {
                keysToDelete.push(key);
            }
        });

        keysToDelete.forEach(key => this.store.delete(key));
    }

    async consume(key: string): Promise<{ allowed: boolean; msBeforeNext?: number; remainingPoints?: number }> {
        this.ensureCleanup();
        const now = Date.now();
        const entry = this.store.get(key);

        if (entry && entry.resetTime > now) {
            if (entry.count >= this.points) {
                // Rate limit exceeded
                return {
                    allowed: false,
                    msBeforeNext: entry.resetTime - now,
                    remainingPoints: 0
                };
            }
            // Increment counter
            entry.count++;
            return {
                allowed: true,
                remainingPoints: this.points - entry.count
            };
        }

        // Create new entry or reset expired one
        this.store.set(key, {
            count: 1,
            resetTime: now + this.duration
        });

        return {
            allowed: true,
            remainingPoints: this.points - 1
        };
    }
}

// Different rate limiters for different endpoints
const rateLimiters = {
    // Strict limit for auth endpoints
    auth: new RateLimiter(5, 900, 900), // 5 requests per 15 minutes

    // Moderate limit for API endpoints
    api: new RateLimiter(100, 60, 60), // 100 requests per minute

    // Cost-sensitive limit for AI tutoring calls
    tutor: new RateLimiter(20, 60, 60), // 20 requests per minute

    // Strict limit for file uploads
    upload: new RateLimiter(10, 3600, 3600), // 10 requests per hour

    // Very strict limit for admin operations
    admin: new RateLimiter(50, 60, 300), // 50 requests per minute, block for 5 minutes
};

export type RateLimitType = keyof typeof rateLimiters;

// Buckets enforced durably in the database. window/max mirror the in-memory config above.
const DURABLE_BUCKETS: Partial<Record<RateLimitType, { max: number; windowSeconds: number }>> = {
    auth: { max: 5, windowSeconds: 900 },
    upload: { max: 10, windowSeconds: 3600 },
    admin: { max: 50, windowSeconds: 60 },
};

async function consumeDurable(
    type: RateLimitType,
    ip: string
): Promise<{ allowed: boolean; msBeforeNext?: number; remainingPoints?: number } | null> {
    const bucket = DURABLE_BUCKETS[type];
    if (!bucket) return null;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceRole) return null; // fall back to in-memory

    const supabase = createClient(url, serviceRole);
    const { data: allowed, error } = await supabase.rpc('hit_rate_limit', {
        p_key: `${type}:${ip}`,
        p_max: bucket.max,
        p_window_seconds: bucket.windowSeconds,
    });

    if (error || typeof allowed !== 'boolean') {
        if (error) console.error('hit_rate_limit failed, falling back to in-memory:', error.message);
        return null; // fall back to in-memory
    }

    return allowed
        ? { allowed: true }
        : { allowed: false, msBeforeNext: bucket.windowSeconds * 1000, remainingPoints: 0 };
}

export async function rateLimit(
    request: NextRequest,
    type: RateLimitType = 'api'
): Promise<NextResponse | null> {
    try {
        const limiter = rateLimiters[type];
        const ip = request.headers.get('x-real-ip') ||
            request.headers.get('x-forwarded-for')?.split(',')[0] ||
            'unknown';

        const result = (await consumeDurable(type, ip)) ?? (await limiter.consume(ip));

        if (!result.allowed) {
            // Too many requests
            const secs = Math.round((result.msBeforeNext || 1000) / 1000);
            const retryAfter = new Date(Date.now() + (result.msBeforeNext || 1000)).toISOString();

            return NextResponse.json(
                {
                    error: 'Too many requests',
                    message: `Rate limit exceeded. Please try again in ${secs} seconds.`,
                    retryAfter,
                },
                {
                    status: 429,
                    headers: {
                        'Retry-After': String(secs),
                        'X-RateLimit-Limit': String(limiter['points']),
                        'X-RateLimit-Remaining': String(result.remainingPoints || 0),
                        'X-RateLimit-Reset': retryAfter,
                    },
                }
            );
        }

        // Request allowed
        return null;
    } catch (error) {
        console.error('Rate limiting error:', error);
        // On error, allow the request (fail open)
        return null;
    }
}

// Helper middleware for rate limiting
export function withRateLimit(
    handler: (req: NextRequest) => Promise<NextResponse>,
    type: RateLimitType = 'api'
) {
    return async (req: NextRequest) => {
        const rateLimitResponse = await rateLimit(req, type);
        if (rateLimitResponse) {
            return rateLimitResponse;
        }
        return handler(req);
    };
}