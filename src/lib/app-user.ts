export type AppUser = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  role: string | null;
};

export function getAppRedirect(role: string | null, returnTo?: string | null): string {
  const home = role === 'admin' ? '/admin/dashboard'
    : role === 'teacher' ? '/teachers/dashboard'
      : role === 'student' ? '/students/dashboard' : '/learn';
  if (!returnTo?.startsWith('/') || returnTo.startsWith('//') || /[\\\u0000-\u0020]/.test(returnTo)) return home;
  const url = new URL(returnTo, 'https://app.invalid');
  const pathname = url.pathname;
  if (['/login', '/signup'].includes(pathname.replace(/\/+$/, ''))) return home;
  for (const [prefix, allowedRole] of [['/admin', 'admin'], ['/teachers', 'teacher'], ['/students', 'student']]) {
    if (pathname.startsWith(prefix) && role !== allowedRole) return home;
  }
  return url.pathname + url.search + url.hash;
}
