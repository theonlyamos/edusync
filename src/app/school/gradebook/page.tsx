'use client';

import { GradebookView } from '@/components/records/GradebookView';
import { SchoolPageHeader } from '@/components/school-portal/SchoolPortalProvider';

export default function Page() {
  return (
    <>
      <SchoolPageHeader title="Gradebook" description="Every student’s marks, class by class." />
      <GradebookView />
    </>
  );
}
