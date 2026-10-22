'use client';

import { useCallback, useContext, useEffect, useState } from 'react';

export const dynamic = 'force-dynamic';
import { useRouter } from 'next/navigation';
import { AppUserContext, SupabaseSessionContext } from '@/components/providers/SupabaseAuthProvider';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { Award, FileText, Loader2, Plus, Timer, Trash2 } from 'lucide-react';
import { GRADE_LEVELS } from '@/lib/constants';

interface Assessment {
  id: string;
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
  questions: unknown[];
  myResult?: { status: string | null; percentage: number } | null;
}

export default function AssessmentsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const session = useContext(SupabaseSessionContext);
  const { user: appUser } = useContext(AppUserContext);
  const isStudent = appUser?.role === 'student';
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [filters, setFilters] = useState({ gradeLevel: 'all', type: 'all' });
  const [now] = useState(() => Date.now());

  const fetchAssessments = useCallback(async () => {
    setError('');
    try {
      const queryParams = new URLSearchParams();
      if (filters.gradeLevel !== 'all') queryParams.append('gradeLevel', filters.gradeLevel);
      if (filters.type !== 'all') queryParams.append('type', filters.type);
      const response = await fetch(`/api/assessments?${queryParams}`);
      if (!response.ok) throw new Error('Could not load assessments');
      setAssessments(await response.json());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    if (session) void fetchAssessments();
  }, [session, fetchAssessments]);

  const setPublished = async (assessment: Assessment, isPublished: boolean) => {
    setBusy(assessment.id);
    try {
      const response = await fetch(`/api/assessments/${assessment.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublished }),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? 'Could not update the assessment');
      setAssessments((current) => current.map((a) => (a.id === assessment.id ? { ...a, isPublished } : a)));
      toast({
        title: isPublished ? 'Published' : 'Moved back to draft',
        description: isPublished
          ? `${assessment.gradeLevel.toUpperCase()} students can now take it.`
          : 'Students can no longer see it.',
      });
    } catch (e) {
      toast({ title: 'Error', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const remove = async (assessment: Assessment) => {
    if (!window.confirm(`Delete "${assessment.title}" and all of its results?`)) return;
    setBusy(assessment.id);
    try {
      const response = await fetch(`/api/assessments/${assessment.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? 'Could not delete the assessment');
      setAssessments((current) => current.filter((a) => a.id !== assessment.id));
      toast({ title: 'Assessment deleted' });
    } catch (e) {
      toast({ title: 'Error', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  if (!session || loading) {
    return (
      <DashboardLayout>
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-3 sm:p-6">
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold sm:text-3xl">Assessments</h1>
            <p className="text-muted-foreground">
              {isStudent ? 'Assessments your teachers have published for your grade' : 'Create quizzes and exams, publish them, and see results'}
            </p>
          </div>
          {!isStudent && (
            <Button onClick={() => router.push('/assessments/create')}>
              <Plus className="mr-2 h-4 w-4" />
              Create assessment
            </Button>
          )}
        </div>

        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
          {!isStudent && (
            <Select value={filters.gradeLevel} onValueChange={(value) => setFilters((prev) => ({ ...prev, gradeLevel: value }))}>
              <SelectTrigger className="min-h-11 xl:min-h-0" aria-label="Filter by grade">
                <SelectValue placeholder="Filter by grade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All grades</SelectItem>
                {GRADE_LEVELS.map((grade) => (
                  <SelectItem key={grade} value={grade}>{grade.toUpperCase()}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={filters.type} onValueChange={(value) => setFilters((prev) => ({ ...prev, type: value }))}>
            <SelectTrigger className="min-h-11 xl:min-h-0" aria-label="Filter by type">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="quiz">Quiz</SelectItem>
              <SelectItem value="exam">Exam</SelectItem>
              <SelectItem value="homework">Homework</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {error ? (
          <div className="space-y-2 py-12 text-center">
            <p className="text-destructive">{error}</p>
            <Button variant="outline" onClick={() => { setLoading(true); void fetchAssessments(); }}>Try again</Button>
          </div>
        ) : assessments.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-muted-foreground">
              {isStudent ? 'No assessments for your grade yet.' : 'No assessments yet. Create one to get started.'}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:gap-6 md:grid-cols-2 xl:grid-cols-3">
            {assessments.map((assessment) => {
              const overdue = Boolean(assessment.dueDate && new Date(assessment.dueDate).getTime() < now);
              return (
                <Card key={assessment.id} className="flex min-w-0 flex-col break-words">
                  <CardHeader className="p-4 sm:p-6">
                    <div className="flex flex-wrap items-center gap-2">
                      {!isStudent && (
                        <Badge variant={assessment.isPublished ? 'default' : 'secondary'}>
                          {assessment.isPublished ? 'Published' : 'Draft'}
                        </Badge>
                      )}
                      {isStudent && assessment.myResult && (
                        <Badge variant={assessment.myResult.status === 'passed' ? 'default' : 'secondary'}>
                          {assessment.myResult.status === 'passed' ? 'Passed' : 'Done'} · {assessment.myResult.percentage}%
                        </Badge>
                      )}
                      <Badge variant="outline" className="capitalize">{assessment.type}</Badge>
                    </div>
                    <CardTitle className="pt-2">{assessment.title}</CardTitle>
                    {assessment.description && <CardDescription>{assessment.description}</CardDescription>}
                  </CardHeader>
                  <CardContent className="flex-1">
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center">
                        <FileText className="mr-2 h-4 w-4 text-muted-foreground" />
                        <span>{assessment.subject} · {assessment.gradeLevel.toUpperCase()} · {assessment.questions.length} questions</span>
                      </div>
                      <div className="flex items-center">
                        <Timer className="mr-2 h-4 w-4 text-muted-foreground" />
                        <span>{assessment.duration} minutes</span>
                      </div>
                      <div className="flex items-center">
                        <Award className="mr-2 h-4 w-4 text-muted-foreground" />
                        <span>Pass mark {assessment.passingScore}% of {assessment.totalPoints} points</span>
                      </div>
                      {assessment.dueDate && (
                        <p className={overdue ? 'text-destructive' : 'text-muted-foreground'}>
                          {overdue ? 'Closed' : 'Due'} {new Date(assessment.dueDate).toLocaleString()}
                        </p>
                      )}
                    </div>
                  </CardContent>
                  <CardFooter className="flex flex-wrap gap-2 [&>button]:min-h-11 xl:[&>button]:min-h-0">
                    {isStudent ? (
                      assessment.myResult ? (
                        <Button className="w-full" variant="outline" onClick={() => router.push(`/assessments/${assessment.id}/results`)}>
                          View my result
                        </Button>
                      ) : (
                        <Button className="w-full" disabled={overdue} onClick={() => router.push(`/assessments/${assessment.id}/take`)}>
                          {overdue ? 'Closed' : 'Start assessment'}
                        </Button>
                      )
                    ) : (
                      <>
                        <Button className="flex-1" variant="outline" onClick={() => router.push(`/assessments/${assessment.id}/results`)}>
                          Results
                        </Button>
                        <Button
                          className="flex-1"
                          variant={assessment.isPublished ? 'outline' : 'default'}
                          disabled={busy === assessment.id}
                          onClick={() => setPublished(assessment, !assessment.isPublished)}
                        >
                          {assessment.isPublished ? 'Unpublish' : 'Publish'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Delete ${assessment.title}`}
                          disabled={busy === assessment.id}
                          onClick={() => remove(assessment)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </>
                    )}
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
