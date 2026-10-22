export type AppUser = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  role: string | null;
};

export const SCHOOL_PORTAL_HOME = '/school/dashboard';

/**
 * Where someone lands after signing in. School owners and administrators
 * (whose account role is a plain one) go to the school admin portal.
 */
export function getAppRedirect(role: string | null, returnTo?: string | null, { managesSchool = false } = {}): string {
  const home = role === 'admin' ? '/admin/dashboard'
    : role === 'teacher' ? '/teachers/dashboard'
      : role === 'student' ? '/students/dashboard'
        : managesSchool ? SCHOOL_PORTAL_HOME : '/learn';
  if (!returnTo?.startsWith('/') || returnTo.startsWith('//') || /[\\\u0000-\u0020]/.test(returnTo)) return home;
  const url = new URL(returnTo, 'https://app.invalid');
  const pathname = url.pathname;
  if (['/login', '/signup'].includes(pathname.replace(/\/+$/, ''))) return home;
  for (const [prefix, allowedRole] of [['/admin', 'admin'], ['/teachers', 'teacher'], ['/students', 'student']]) {
    if (pathname.startsWith(prefix) && role !== allowedRole) return home;
  }
  return url.pathname + url.search + url.hash;
}

/** Roles whose home doesn't depend on a school role. */
const PORTAL_ROLES = ['admin', 'teacher', 'student'];

/** Whether the signed-in person runs a school (browser only). */
export async function fetchManagesSchool(): Promise<boolean> {
  try {
    const res = await fetch('/api/schools/current');
    if (!res.ok) return false;
    const body = await res.json();
    return body?.role === 'owner' || body?.role === 'admin';
  } catch {
    return false;
  }
}

/** getAppRedirect, first checking whether a plain account runs a school. */
export async function resolveAppRedirect(role: string | null, returnTo?: string | null): Promise<string> {
  const managesSchool = !PORTAL_ROLES.includes(role ?? '') && (await fetchManagesSchool());
  return getAppRedirect(role, returnTo, { managesSchool });
}
