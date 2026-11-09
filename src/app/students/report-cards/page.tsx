'use client';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { StudentRecords } from '@/components/records/StudentRecords';

export default function Page() {
  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold sm:text-3xl">Report cards</h1>
        <p className="mt-1 text-muted-foreground">Your attendance and the report cards your teachers have shared.</p>
      </div>
      <StudentRecords />
    </DashboardLayout>
  );
}
