'use client';

import { SchoolTimetablesPanel } from '@/components/school/SchoolTimetablesPanel';
import { SchoolPageHeader } from '@/components/school-portal/SchoolPortalProvider';

export default function SchoolTimetablesPage() {
  return (
    <>
      <SchoolPageHeader title="Timetables" description="The weekly timetable for each grade. Students and teachers see their own." />
      <SchoolTimetablesPanel />
    </>
  );
}
