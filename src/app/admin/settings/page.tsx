'use client';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AccountSettings } from '@/components/account/AccountSettings';

export default function SettingsPage() {
  return (
    <DashboardLayout>
      <AccountSettings />
    </DashboardLayout>
  );
}
