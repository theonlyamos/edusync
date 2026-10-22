'use client';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { SchoolPortalProvider } from '@/components/school-portal/SchoolPortalProvider';

export default function SchoolPortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardLayout portal="school">
      <SchoolPortalProvider>{children}</SchoolPortalProvider>
    </DashboardLayout>
  );
}
