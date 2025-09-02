'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AssessmentResults } from '@/components/assessment/AssessmentResults';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';

interface Assessment {
  _id: string;
  title: string;
  description: string;
  questions: {
    _id: string;
    question: string;
    type: string;
    points: number;
  }[];
}

interface AssessmentResult {
  _id: string;
  studentId: {
    _id: string;
    name: string;
    email: string;
  };
  answers: {
    questionId: string;
    answer: string;
    isCorrect: boolean;
    points: number;
  }[];
  totalScore: number;
  percentage: number;
  status: 'passed' | 'failed';
  startedAt: string;
  submittedAt: string;
  timeSpent: number;
}

interface Statistics {
  totalSubmissions: number;
  averageScore: number;
  passRate: number;
  averageTimeSpent: number;
}

export default function AssessmentResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const router = useRouter();
  const { toast } = useToast();
  const { data: session } = useSession();
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [results, setResults] = useState<AssessmentResult[]>([]);
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Fetch assessment details
      const assessmentResponse = await fetch(`/api/assessments/${resolvedParams.id}`);
      if (!assessmentResponse.ok) throw new Error('Failed to fetch assessment');
      const assessmentData = await assessmentResponse.json();
      setAssessment(assessmentData);

      // Fetch results
      const resultsResponse = await fetch(
        `/api/assessments/${resolvedParams.id}/results`
      );
      if (!resultsResponse.ok) throw new Error('Failed to fetch results');
      const resultsData = await resultsResponse.json();

      if (session?.user?.role === 'student') {
        setResults([resultsData]); // Single result for student
        setStatistics({
          totalSubmissions: 1,
          averageScore: resultsData.percentage,
          passRate: resultsData.status === 'passed' ? 100 : 0,
          averageTimeSpent: resultsData.timeSpent,
        });
      } else {
        setResults(resultsData.results);
        setStatistics(resultsData.statistics);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      setError('Failed to load results. Please try again.');
      toast({
        title: 'Error',
        description: 'Failed to load results. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
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

  if (error || !assessment || !statistics) {
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
      <div className="container mx-auto p-6">
        <Link
          href="/assessments"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Assessments
        </Link>

        <div className="mb-6">
          <h1 className="text-3xl font-bold">{assessment.title}</h1>
          <p className="text-muted-foreground">{assessment.description}</p>
        </div>

        <AssessmentResults
          results={results}
          statistics={statistics}
          questions={assessment.questions}
          userRole={session?.user?.role as 'teacher' | 'admin' | 'student'}
        />
      </div>
    </DashboardLayout>
  );
} 