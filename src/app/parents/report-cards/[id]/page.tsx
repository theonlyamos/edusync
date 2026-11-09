'use client';

import { use } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { ReportCardPage } from '@/components/records/ReportCardView';

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <DashboardLayout portal="parent">
      <ReportCardPage id={use(params).id} backHref="/parents" source="/api/parents/report-cards" />
    </DashboardLayout>
  );
}
