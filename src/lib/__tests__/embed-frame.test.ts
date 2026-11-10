import { describe, expect, it } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { frameAncestorSources, hasDomainLimit, openedOutsideFrame } from '@/lib/embed-frame';
import { addSecurityHeaders } from '@/middleware/security';

describe('frameAncestorSources', () => {
  it('lets any site frame a key with no allowed domains', () => {
    expect(frameAncestorSources(null)).toBe('*');
    expect(frameAncestorSources([])).toBe('*');
    expect(hasDomainLimit([])).toBe(false);
  });

  it('names each allowed site over https, plus the app itself', () => {
    expect(frameAncestorSources(['example.com', 'app.school.org'])).toBe("'self' https://example.com https://app.school.org");
  });

  it('treats a wildcard as the site and its subdomains, like the API check', () => {
    expect(frameAncestorSources(['*.example.com'])).toBe("'self' https://example.com https://*.example.com");
  });

  it('allows local development over http on any port', () => {
    expect(frameAncestorSources(['localhost'])).toBe("'self' http://localhost:* https://localhost:*");
  });

  it('drops entries that are not hostnames, so nothing can add a directive', () => {
    expect(frameAncestorSources(['example.com; script-src *', 'https://evil.com', '* ', 'ok.com'])).toBe("'self' https://ok.com");
    expect(frameAncestorSources(['*; default-src *'])).toBe("'self'");
  });
});

describe('openedOutsideFrame', () => {
  it('is only true for a limited key opened as its own page', () => {
    expect(openedOutsideFrame(['example.com'], 'document')).toBe(true);
    expect(openedOutsideFrame(['example.com'], 'iframe')).toBe(false);
    expect(openedOutsideFrame(['example.com'], null)).toBe(false);
    expect(openedOutsideFrame(null, 'document')).toBe(false);
  });
});

describe('frame rule in the security headers', () => {
  const csp = (path: string, sources?: string) =>
    addSecurityHeaders(NextResponse.next(), new NextRequest(`https://app.test${path}`), sources).headers.get('Content-Security-Policy') ?? '';

  it('limits a tutor page to the key’s sites', () => {
    expect(csp('/embed/new', "'self' https://example.com")).toContain("frame-ancestors 'self' https://example.com;");
  });

  it('leaves a tutor page without a limit open to any site', () => {
    expect(csp('/embed/new')).toContain('frame-ancestors *;');
  });

  it('never lets other pages be framed, whatever is passed', () => {
    expect(csp('/learn', '*')).toContain("frame-ancestors 'none'");
    expect(csp('/embed/new/extra', '*')).toContain("frame-ancestors 'none'");
  });
});
