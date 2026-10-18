import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/homework/ai-policy-server', () => ({ editableHomeworkForUser: async () => null }));
import { proxy } from '@/proxy';

describe('proxy auth headers', () => {
    it('never forwards auth headers a client sent itself', async () => {
        const request = new NextRequest('https://app.test/embed/widget', {
            headers: {
                'x-auth-user-id': 'forged-user',
                'x-auth-type': 'session',
                'x-auth-api-key-id': 'forged-key',
                'x-auth-user-role': 'student',
                'x-kept': 'yes',
            },
        });
        const response = await proxy(request);
        const forwarded = (response.headers.get('x-middleware-override-headers') ?? '').split(',');
        expect(forwarded).toContain('x-kept');
        for (const header of ['x-auth-user-id', 'x-auth-type', 'x-auth-api-key-id', 'x-auth-user-role']) {
            expect(forwarded).not.toContain(header);
            expect(response.headers.get(`x-middleware-request-${header}`)).toBeNull();
        }
    });
});
