'use client';

import { SchoolCalendar } from '@/components/calendar/SchoolCalendar';
import { DashboardLayout } from '@/components/layout/DashboardLayout';

export default function StudentCalendarPage() {
  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold sm:text-3xl">Calendar</h1>
        <p className="mt-1 text-muted-foreground">Your school’s terms, holidays and exam weeks.</p>
      </div>
      <SchoolCalendar />
    </DashboardLayout>
  );
}
