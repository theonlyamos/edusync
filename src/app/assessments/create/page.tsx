'use client';

import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AssessmentForm } from '@/components/assessment/AssessmentForm';
import { useToast } from '@/components/ui/use-toast';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function CreateAssessmentPage() {
  const router = useRouter();
  const { toast } = useToast();

  const handleSubmit = async (data: any) => {
    try {
      const response = await fetch('/api/assessments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error('Failed to create assessment');
      }

      toast({
        title: 'Success',
        description: 'Assessment created successfully',
      });

      router.push('/assessments');
    } catch (error) {
      console.error('Error creating assessment:', error);
      toast({
        title: 'Error',
        description: 'Failed to create assessment. Please try again.',
        variant: 'destructive',
      });
      throw error;
    }
  };

  return (
    <DashboardLayout>
      <div className="container max-w-4xl mx-auto p-6">
        <Link
          href="/assessments"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Assessments
        </Link>

        <div className="mb-6">
          <h1 className="text-3xl font-bold">Create Assessment</h1>
          <p className="text-muted-foreground">
            Create a new assessment for your students
          </p>
        </div>

        <AssessmentForm onSubmit={handleSubmit} />
      </div>
    </DashboardLayout>
  );
} 