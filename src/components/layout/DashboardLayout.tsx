'use client';

import { useEffect, useContext, useState } from 'react';
import { Menu } from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { AppUserContext, SupabaseSessionContext } from '@/components/providers/SupabaseAuthProvider';
import { Sidebar } from './Sidebar';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { HomeworkAiLockBanner, isStudentAiPage } from '@/components/students/HomeworkAiLockBanner';

const STUDENT_PAGE_TITLES: [string, string][] = [
  ['/students/homework/performance', 'My performance'],
  ['/students/dashboard', 'Dashboard'],
  ['/students/lessons', 'Lessons'],
  ['/students/learn', 'Learn with AI'],
  ['/students/homework', 'Homework'],
  ['/students/live', 'Live classes'],
  ['/students/timetable', 'Timetable'],
  ['/students/practice', 'Practice'],
  ['/students/tutor', 'Study companion'],
  ['/students/collaborator', 'Collaborator'],
  ['/students/settings', 'Settings'],
];

const SCHOOL_PAGE_TITLES: [string, string][] = [
  ['/school/dashboard', 'Dashboard'],
  ['/school/students', 'Students'],
  ['/school/teachers', 'Teachers'],
  ['/school/administrators', 'Administrators'],
  ['/school/grades', 'Grades'],
  ['/school/classes', 'Classes'],
  ['/school/subjects', 'Subjects'],
  ['/school/timetables', 'Timetables'],
  ['/school/lessons', 'Lessons'],
  ['/school/reports', 'Reports'],
  ['/school/billing', 'Billing'],
  ['/school/settings', 'School settings'],
  ['/school/account', 'Account settings'],
];

const ADMIN_PAGE_TITLES: [string, string][] = [
  ['/admin/dashboard', 'Overview'],
  ['/admin/schools', 'Schools'],
  ['/admin/users/admins', 'Admins'],
  ['/admin/users', 'Users'],
  ['/admin/billing', 'Billing'],
  ['/admin/usage', 'AI usage'],
  ['/admin/feedback', 'Feedback'],
  ['/admin/organizations', 'Developers'],
  ['/admin/activity', 'Activity log'],
  ['/admin/settings', 'Settings'],
];

/** The page name shown in the phone header. */
function pageTitle(titles: [string, string][], pathname: string | null, fallback: string) {
  const match = titles.find(([path]) => pathname === path || pathname?.startsWith(path + '/'));
  return match?.[1] ?? fallback;
}

export interface DashboardLayoutProps {
  children: React.ReactNode;
  role?: string;
  fullBleed?: boolean;
  /** Show a portal that doesn't follow the account role (the school admin portal). */
  portal?: 'school';
}

export function DashboardLayout({ children, fullBleed = false, portal }: DashboardLayoutProps) {
  const router = useRouter();
  const session = useContext(SupabaseSessionContext);
  const { user: appUser, loading, error } = useContext(AppUserContext);
  const pathname = usePathname();
  const [navigationOpen, setNavigationOpen] = useState(false);

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)');
    const closeOnDesktop = () => { if (desktop.matches) setNavigationOpen(false); };
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, []);

  useEffect(() => {
    if (session === null) {
      const back = pathname ? `?redirectedFrom=${encodeURIComponent(pathname)}` : ''
      router.push(`/login${back}`);
    }
  }, [session, router, pathname]);

  if (error) {
    return <main className="min-h-screen flex flex-col items-center justify-center gap-4">
      <p role="alert">{error}</p>
      <button onClick={() => window.location.reload()}>Try again</button>
    </main>;
  }

  if (!session?.user || loading || !appUser) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const userRole = appUser.role;
  const role = portal
    ?? ((userRole === 'admin' || userRole === 'teacher' || userRole === 'student') ? userRole : null);
  const portalName = role ? role.charAt(0).toUpperCase() + role.slice(1) : '';

  return (
    <div className={cn('flex h-dvh min-h-0 bg-background', role && 'flex-col lg:flex-row')}>
      {role && (
        <>
          <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-card px-3 lg:hidden">
            <Dialog open={navigationOpen} onOpenChange={setNavigationOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-11 w-11" aria-label={`Open ${portalName} navigation`}>
                  <Menu className="h-5 w-5" />
                </Button>
              </DialogTrigger>
              <DialogContent className="left-0 top-0 h-dvh max-h-dvh w-[min(20rem,calc(100vw-2rem))] max-w-none translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-none p-0 sm:rounded-none [&>button]:h-11 [&>button]:w-11 [&>button]:flex [&>button]:items-center [&>button]:justify-center">
                <DialogTitle className="sr-only">{portalName} navigation</DialogTitle>
                <DialogDescription className="sr-only">Choose a page in your {portalName.toLowerCase()} portal.</DialogDescription>
                <Sidebar role={role} mobile onNavigate={() => setNavigationOpen(false)} />
              </DialogContent>
            </Dialog>
<span className="truncate text-sm font-semibold">
              {role === 'student'
                ? pageTitle(STUDENT_PAGE_TITLES, pathname, 'Student Portal')
                : role === 'school'
                  ? pageTitle(SCHOOL_PAGE_TITLES, pathname, 'School Portal')
                  : role === 'admin'
                    ? pageTitle(ADMIN_PAGE_TITLES, pathname, 'Admin Portal')
                    : `${portalName} Portal`}
            </span>
          </header>
          <div className="hidden h-full shrink-0 lg:block"><Sidebar role={role} /></div>
        </>
      )}
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        {role === 'student' && isStudentAiPage(pathname) && <HomeworkAiLockBanner />}
        {fullBleed ? (
          children
        ) : (
          <div className="container mx-auto px-3 py-4 sm:px-4 sm:py-6">
            {children}
          </div>
        )}
      </main>
    </div>
  );
}
