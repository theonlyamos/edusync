'use client';

import { useState, useEffect, useContext } from 'react';

export const dynamic = 'force-dynamic';
import { useRouter } from 'next/navigation';
import { SupabaseSessionContext } from '@/components/providers/SupabaseAuthProvider';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Plus, FileText, Timer, Award } from 'lucide-react';

interface Assessment {
  _id: string;
  title: string;
  description: string;
  subject: string;
  gradeLevel: string;
  type: string;
  duration: number;
  totalPoints: number;
  passingScore: number;
  dueDate?: string;
  isPublished: boolean;
  createdBy: {
    name: string;
    email: string;
  };
}

export default function AssessmentsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const session = useContext(SupabaseSessionContext);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    subject: 'all',
    gradeLevel: 'all',
    type: 'all',
  });

  useEffect(() => {
    fetchAssessments();
  }, [filters]);

  const fetchAssessments = async () => {
    try {
      const queryParams = new URLSearchParams();
      if (filters.subject !== 'all') queryParams.append('subject', filters.subject);
      if (filters.gradeLevel !== 'all') queryParams.append('gradeLevel', filters.gradeLevel);
      if (filters.type !== 'all') queryParams.append('type', filters.type);

      const response = await fetch(`/api/assessments?${queryParams}`);
      if (!response.ok) throw new Error('Failed to fetch assessments');

      const data = await response.json();
      setAssessments(data);
    } catch (error) {
      console.error('Error fetching assessments:', error);
      toast({
        title: 'Error',
        description: 'Failed to load assessments. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleStartAssessment = (assessmentId: string) => {
    router.push(`/assessments/${assessmentId}/take`);
  };

  const handleViewResults = (assessmentId: string) => {
    router.push(`/assessments/${assessmentId}/results`);
  };

  if (!session || loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold">Assessments</h1>
            <p className="text-muted-foreground">
              {session?.user?.role === 'student'
                ? 'View and take available assessments'
                : 'Manage and create assessments'}
            </p>
          </div>
          {(session?.user?.role === 'teacher' || session?.user?.role === 'admin') && (
            <Button onClick={() => router.push('/assessments/create')}>
              <Plus className="mr-2 h-4 w-4" />
              Create Assessment
            </Button>
          )}
        </div>

        <div className="grid grid-cols-3 gap-4 mb-6">
          <Select
            value={filters.subject}
            onValueChange={(value) =>
              setFilters((prev) => ({ ...prev, subject: value }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Filter by Subject" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Subjects</SelectItem>
              {/* Add your subjects here */}
            </SelectContent>
          </Select>

          <Select
            value={filters.gradeLevel}
            onValueChange={(value) =>
              setFilters((prev) => ({ ...prev, gradeLevel: value }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Filter by Grade Level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Grades</SelectItem>
              {/* Add your grade levels here */}
            </SelectContent>
          </Select>

          <Select
            value={filters.type}
            onValueChange={(value) =>
              setFilters((prev) => ({ ...prev, type: value }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Filter by Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="quiz">Quiz</SelectItem>
              <SelectItem value="exam">Exam</SelectItem>
              <SelectItem value="homework">Homework</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {assessments.map((assessment) => (
            <Card key={assessment._id}>
              <CardHeader>
                <CardTitle>{assessment.title}</CardTitle>
                <CardDescription>{assessment.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center text-sm">
                    <FileText className="mr-2 h-4 w-4 text-muted-foreground" />
                    <span>
                      {assessment.subject} - {assessment.gradeLevel}
                    </span>
                  </div>
                  <div className="flex items-center text-sm">
                    <Timer className="mr-2 h-4 w-4 text-muted-foreground" />
                    <span>{assessment.duration} minutes</span>
                  </div>
                  <div className="flex items-center text-sm">
                    <Award className="mr-2 h-4 w-4 text-muted-foreground" />
                    <span>
                      Pass Score: {assessment.passingScore}% ({assessment.totalPoints}{' '}
                      points)
                    </span>
                  </div>
                  {assessment.dueDate && (
                    <p className="text-sm text-muted-foreground">
                      Due: {new Date(assessment.dueDate).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </CardContent>
              <CardFooter className="flex justify-between">
                {session?.user?.role === 'student' ? (
                  <Button
                    className="w-full"
                    onClick={() => handleStartAssessment(assessment._id)}
                  >
                    Start Assessment
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    onClick={() => handleViewResults(assessment._id)}
                  >
                    View Results
                  </Button>
                )}
              </CardFooter>
            </Card>
          ))}
        </div>

        {assessments.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No assessments found</p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
} 