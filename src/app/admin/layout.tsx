'use client';

import { DashboardLayout } from '@/components/layout/DashboardLayout';

/** Every platform admin page shares the admin sidebar. */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
