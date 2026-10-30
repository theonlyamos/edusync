'use client';

import { Suspense } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { HelpCenter } from '@/components/support/HelpCenter';

/** Help & feedback for students, teachers and anyone without a school portal. */
export default function HelpPage() {
  return (
    <DashboardLayout>
      <Suspense fallback={null}>
        <HelpCenter portal="help" />
      </Suspense>
    </DashboardLayout>
  );
}
