import { NextRequest, NextResponse } from 'next/server';

// Simple in-memory rate limiter
// In production, use Redis or a database for distributed rate limiting

interface RateLimitEntry {
    count: number;
    resetTime: number;
}

class RateLimiter {
    private store: Map<string, RateLimitEntry> = new Map();
    private readonly points: number;
    private readonly duration: number; // in seconds
    private readonly blockDuration: number; // in seconds

    constructor(points: number, duration: number, blockDuration: number) {
        this.points = points;
        this.duration = duration * 1000; // Convert to milliseconds
        this.blockDuration = blockDuration * 1000; // Convert to milliseconds

        // Clean up old entries every minute
        setInterval(() => this.cleanup(), 60000);
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

    // Strict limit for file uploads
    upload: new RateLimiter(10, 3600, 3600), // 10 requests per hour

    // Very strict limit for admin operations
    admin: new RateLimiter(50, 60, 300), // 50 requests per minute, block for 5 minutes
};

export type RateLimitType = keyof typeof rateLimiters;

export async function rateLimit(
    request: NextRequest,
    type: RateLimitType = 'api'
): Promise<NextResponse | null> {
    try {
        const limiter = rateLimiters[type];
        const ip = request.headers.get('x-real-ip') ||
            request.headers.get('x-forwarded-for')?.split(',')[0] ||
            'unknown';

        const result = await limiter.consume(ip);

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