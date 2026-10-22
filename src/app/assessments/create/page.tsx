'use client';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AssessmentForm } from '@/components/assessment/AssessmentForm';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function CreateAssessmentPage() {
  // The form shows success or error toasts and returns to the list.
  const handleSubmit = async (data: unknown) => {
    const response = await fetch('/api/assessments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.error ?? 'Failed to create assessment');
    }
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto max-w-4xl p-4 sm:p-6">
        <Link
          href="/assessments"
          className="mb-6 inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground xl:min-h-0"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Assessments
        </Link>

        <div className="mb-6">
          <h1 className="text-2xl font-bold sm:text-3xl">Create assessment</h1>
          <p className="text-muted-foreground">
            It is saved as a draft. Students in the chosen grade see it once you publish it.
          </p>
        </div>

        <AssessmentForm onSubmit={handleSubmit} />
      </div>
    </DashboardLayout>
  );
}
