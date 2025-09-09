'use client';

import { useEffect, useContext } from 'react';
import { useRouter } from 'next/navigation';
import { SupabaseSessionContext } from '@/components/providers/SupabaseAuthProvider';
import { Sidebar } from './Sidebar';

export interface DashboardLayoutProps {
  children: React.ReactNode;
  role?: string;
  fullBleed?: boolean;
}

export function DashboardLayout({ children, fullBleed = false }: DashboardLayoutProps) {
  const router = useRouter();
  const session = useContext(SupabaseSessionContext);

  useEffect(() => {
    if (!session?.user) {
      router.push('/login');
    }
  }, [session, router]);

  if (!session?.user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const userRole = (session.user as any)?.role;
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