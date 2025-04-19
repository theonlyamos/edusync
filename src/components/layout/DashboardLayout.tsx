'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Sidebar } from './Sidebar';

export interface DashboardLayoutProps {
  children: React.ReactNode;
  role?: string;
  fullBleed?: boolean;
}

export function DashboardLayout({ children, fullBleed = false }: DashboardLayoutProps) {
  const router = useRouter();
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === 'loading') return;
    if (!session?.user) {
      router.push('/login');
    }
  }, [status, session, router]);

  if (status !== 'authenticated') {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const userRole = session.user.role;
  const role = (userRole === 'admin' || userRole === 'teacher' || userRole === 'student')
    ? userRole
    : 'student';

  return (
    <div className="flex h-screen bg-background">
      <Sidebar role={role} />
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