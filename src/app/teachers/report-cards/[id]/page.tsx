'use client';

import { use } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { ReportCardPage } from '@/components/records/ReportCardView';

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <DashboardLayout>
      <ReportCardPage id={use(params).id} backHref="/teachers/report-cards" />
    </DashboardLayout>
  );
}
