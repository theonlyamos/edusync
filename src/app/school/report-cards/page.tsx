'use client';

import { ReportCardsManager } from '@/components/records/ReportCardsManager';
import { SchoolPageHeader } from '@/components/school-portal/SchoolPortalProvider';

export default function Page() {
  return (
    <>
      <SchoolPageHeader title="Report cards" description="Make term report cards for any class, add comments, then share them." />
      <ReportCardsManager basePath="/school" />
    </>
  );
}
