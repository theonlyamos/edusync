'use client';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AttendanceRegister } from '@/components/records/AttendanceRegister';

export default function Page() {
  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold sm:text-3xl">Attendance</h1>
        <p className="mt-1 text-muted-foreground">Take the register for your classes each day.</p>
      </div>
      <AttendanceRegister />
    </DashboardLayout>
  );
}
