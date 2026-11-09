'use client';

import { AttendanceRegister } from '@/components/records/AttendanceRegister';
import { SchoolPageHeader } from '@/components/school-portal/SchoolPortalProvider';

export default function Page() {
  return (
    <>
      <SchoolPageHeader title="Attendance" description="Take or correct the daily register for any class." />
      <AttendanceRegister />
    </>
  );
}
