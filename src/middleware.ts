import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getServerSession, type CookieAdapter } from '@/lib/auth';

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const pathname = request.nextUrl.pathname;

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
