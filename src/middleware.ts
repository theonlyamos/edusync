import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getServerSession, type CookieAdapter } from '@/lib/auth';
import { addSecurityHeaders, configureCORS } from '@/middleware/security';
import { rateLimit } from '@/lib/rate-limiter';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  // Add security headers to all responses
  response = addSecurityHeaders(response);

  // Configure CORS
  response = configureCORS(request, response);

  // Handle CORS preflight early
  if (request.method === 'OPTIONS') {
    return response;
  }

  const pathname = request.nextUrl.pathname;

  // Apply rate limiting to API routes
  if (pathname.startsWith('/api/')) {
    let rateLimitType: 'api' | 'auth' | 'upload' | 'admin' = 'api';

    if (pathname.startsWith('/api/auth/') || pathname.includes('/login') || pathname.includes('/signup')) {
      rateLimitType = 'auth';
    } else if (pathname.startsWith('/api/upload')) {
      rateLimitType = 'upload';
    } else if (pathname.startsWith('/api/admin/')) {
      rateLimitType = 'admin';
    }

    const rateLimitResponse = await rateLimit(request, rateLimitType);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }
  }

  const isAdminArea = pathname.startsWith('/admin');
  const isTeacherArea = pathname.startsWith('/teachers');
  const isStudentArea = pathname.startsWith('/students');
  const isSessionArea = pathname.startsWith('/session');
  const isProtected = isAdminArea || isTeacherArea || isStudentArea || isSessionArea;

  if (!isProtected) {
    return response;
  }

  const adapter: CookieAdapter = {
    getAll: () => request.cookies.getAll().map(({ name, value }) => ({ name, value })),
    setAll: (cookiesToSet) => {
      cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
    },
  };

  const session = await getServerSession(adapter);

  if (!session?.user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirectedFrom', pathname);
    return NextResponse.redirect(url);
  }
  const role = (session.user as any)?.role ?? null;

  if (isAdminArea && role !== 'admin') {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }
  if (isTeacherArea && role !== 'teacher') {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }
  if (isStudentArea && role !== 'student') {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ['/session/:path*', '/admin/:path*', '/teachers/:path*', '/students/:path*'],
};
