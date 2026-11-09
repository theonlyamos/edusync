'use client';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { ReportCardsManager } from '@/components/records/ReportCardsManager';

export default function Page() {
  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold sm:text-3xl">Report cards</h1>
        <p className="mt-1 text-muted-foreground">Make term report cards from marks and attendance, add your comment, then share them.</p>
      </div>
      <ReportCardsManager basePath="/teachers" />
    </DashboardLayout>
  );
}
