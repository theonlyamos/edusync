'use client';

import { SchoolCalendar } from '@/components/calendar/SchoolCalendar';
import { SchoolPageHeader } from '@/components/school-portal/SchoolPortalProvider';

export default function SchoolCalendarPage() {
  return (
    <>
      <SchoolPageHeader title="Calendar" description="Your terms, holidays, exam weeks and events. Teachers and students see it too." />
      <SchoolCalendar />
    </>
  );
}
