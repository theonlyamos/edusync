'use client';

import { use } from 'react';
import { ReportCardPage } from '@/components/records/ReportCardView';

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <ReportCardPage id={use(params).id} backHref="/school/report-cards" />;
}
