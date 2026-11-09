'use client';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { GradebookView } from '@/components/records/GradebookView';

export default function Page() {
  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold sm:text-3xl">Gradebook</h1>
        <p className="mt-1 text-muted-foreground">Every student’s marks for a class in one place.</p>
      </div>
      <GradebookView />
    </DashboardLayout>
  );
}
