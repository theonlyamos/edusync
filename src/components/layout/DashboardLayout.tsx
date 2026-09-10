'use client';

import { useEffect, useContext } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { AppUserContext, SupabaseSessionContext } from '@/components/providers/SupabaseAuthProvider';
import { Sidebar } from './Sidebar';

export interface DashboardLayoutProps {
  children: React.ReactNode;
  role?: string;
  fullBleed?: boolean;
}

export function DashboardLayout({ children, fullBleed = false }: DashboardLayoutProps) {
  const router = useRouter();
  const session = useContext(SupabaseSessionContext);
  const { user: appUser, loading, error } = useContext(AppUserContext);
  const pathname = usePathname();

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
  const role = (userRole === 'admin' || userRole === 'teacher' || userRole === 'student')
    ? userRole
    : null;

  return (
    <div className="flex h-screen bg-background">
      {role && <Sidebar role={role} />}
      <main className="flex-1 overflow-y-auto">
        {fullBleed ? (
          children
        ) : (
          <div className="container mx-auto py-6 px-4">
            {children}
          </div>
        )}
      </main>
    </div>
  );
}
