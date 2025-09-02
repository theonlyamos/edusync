'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AssessmentTaker } from '@/components/assessment/AssessmentTaker';
import { useToast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Assessment {
  _id: string;
  title: string;
  description: string;
  duration: number;
  totalPoints: number;
  questions: {
    _id: string;
    question: string;
    type: 'multiple_choice' | 'true_false' | 'short_answer';
    options?: string[];
    points: number;
  }[];
}

export default function TakeAssessmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const router = useRouter();
  const { toast } = useToast();
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [showStartDialog, setShowStartDialog] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAssessment();
  }, []);

  const fetchAssessment = async () => {
    try {
      const response = await fetch(`/api/assessments/${resolvedParams.id}`);
      if (!response.ok) throw new Error('Failed to fetch assessment');

      const data = await response.json();
      setAssessment(data);
    } catch (error) {
      console.error('Error fetching assessment:', error);
      setError('Failed to load assessment. Please try again.');
      toast({
        title: 'Error',
        description: 'Failed to load assessment. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleStartAssessment = () => {
    setShowStartDialog(false);
  };

  const handleCancelAssessment = () => {
    router.push('/assessments');
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  if (error || !assessment) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-screen">
          <p className="text-destructive mb-4">{error}</p>
          <button
            onClick={() => router.push('/assessments')}
            className="text-primary hover:underline"
          >
            Return to Assessments
          </button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      {showStartDialog ? (
        <AlertDialog open={showStartDialog} onOpenChange={setShowStartDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Start Assessment</AlertDialogTitle>
              <AlertDialogDescription className="space-y-2">
                <p>You are about to start: {assessment.title}</p>
                <p>Duration: {assessment.duration} minutes</p>
                <p>Total Points: {assessment.totalPoints}</p>
                <p className="font-medium">
                  Once you start, the timer will begin and you cannot pause or
                  restart the assessment.
                </p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={handleCancelAssessment}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction onClick={handleStartAssessment}>
                Start Assessment
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : (
        <AssessmentTaker assessment={assessment} />
      )}
    </DashboardLayout>
  );
} 