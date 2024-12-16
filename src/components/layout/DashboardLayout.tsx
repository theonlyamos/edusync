'use client';

import { useSession } from 'next-auth/react';
import { Sidebar } from './Sidebar';
import { redirect } from 'next/navigation';

interface DashboardLayoutProps {
  children: React.ReactNode;
  role?: string
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!session?.user) {
    redirect('/login');
  }

  const role = session.user.role === 'admin' || 
               session.user.role === 'teacher' || 
               session.user.role === 'student' 
               ? session.user.role 
               : 'student';

  return (
    <div className="flex h-screen bg-background">
      <Sidebar role={role} />
      <main className="flex-1 overflow-y-auto">
        <div className="container mx-auto py-6 px-4">
          {children}
        </div>
      </main>
    </div>
  );
} 