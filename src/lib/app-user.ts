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

/** Whether the signed-in person is a parent following a student (browser only). */
export async function fetchIsParent(): Promise<boolean> {
  try {
    const res = await fetch('/api/parents/me?check=1');
    if (!res.ok) return false;
    return (await res.json())?.parent === true;
  } catch {
    return false;
  }
}

export const PARENT_PORTAL_HOME = '/parents';

/** getAppRedirect, first checking whether a plain account runs a school or is a parent. */
export async function resolveAppRedirect(role: string | null, returnTo?: string | null): Promise<string> {
  if (PORTAL_ROLES.includes(role ?? '')) return getAppRedirect(role, returnTo);
  const managesSchool = await fetchManagesSchool();
  const to = getAppRedirect(role, returnTo, { managesSchool });
  // A parent with nowhere particular to go lands on their children's page, not the solo tutor.
  if (!managesSchool && to === '/learn' && (await fetchIsParent())) return PARENT_PORTAL_HOME;
  return to;
}
