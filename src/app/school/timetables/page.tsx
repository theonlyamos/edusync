'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { SchoolTimetablesPanel } from '@/components/school/SchoolTimetablesPanel';
import { SchoolPageHeader } from '@/components/school-portal/SchoolPortalProvider';

function Timetables() {
  const params = useSearchParams();
  return <SchoolTimetablesPanel initialGrade={params.get('grade') ?? undefined} initialClassId={params.get('class') ?? undefined} />;
}

export default function SchoolTimetablesPage() {
  return (
    <>
      <SchoolPageHeader title="Timetables" description="The weekly timetable for each class or grade. Students and teachers see their own." />
      <Suspense fallback={null}><Timetables /></Suspense>
    </>
  );
}
