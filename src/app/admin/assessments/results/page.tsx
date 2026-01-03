'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

interface AssessmentResult {
  id: string;
  score: number;
  percentage?: number;
  submittedAt?: string;
  submitted_at?: string;
  assessment?: {
    title?: string;
    subject?: string;
    totalPoints?: number;
    total_points?: number;
  };
  student?: {
    name?: string;
    email?: string;
  };
}

export default function AssessmentResultsPage() {
  const { toast } = useToast();
  const [results, setResults] = useState<AssessmentResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchResults();
  }, []);

  const fetchResults = async () => {
    try {
      const response = await fetch('/api/admin/assessments/results');
      if (!response.ok) throw new Error('Failed to fetch assessment results');
      const data = await response.json();
      setResults(data);
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch assessment results',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Calculate statistics
  const subjectToScores: Record<string, number[]> = {};
  let overallSum = 0;
  let overallCount = 0;

  for (const r of results) {
    const totalPoints = r.assessment?.totalPoints ?? r.assessment?.total_points ?? 0;
    const pct = typeof r.percentage === 'number'
      ? r.percentage
      : (typeof r.score === 'number' && totalPoints > 0)
        ? Math.min(100, Math.max(0, (r.score / totalPoints) * 100))
        : 0;
    const subject: string = r.assessment?.subject ?? 'Unknown';
    subjectToScores[subject] = subjectToScores[subject] || [];
    subjectToScores[subject].push(pct);
    overallSum += pct;
    overallCount += 1;
  }

  const subjectRows = Object.entries(subjectToScores).map(([subject, scores]) => {
    const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    return { subject, average: avg };
  }).sort((a, b) => b.average - a.average);

  return (
    <DashboardLayout>
      <div className="container mx-auto py-10">
        <h1 className="text-3xl font-bold mb-8">Assessment Results Overview</h1>

        <div className="grid gap-4 md:grid-cols-3 mb-8">
          <Card>
            <CardHeader>
              <CardTitle>Total Assessments</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-10 w-16" />
              ) : (
                <p className="text-3xl font-bold">{results.length}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Average Score</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-10 w-16" />
              ) : (
                <p className="text-3xl font-bold">
                  {overallCount ? Math.round(overallSum / overallCount) : 0}%
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Subjects Covered</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-10 w-16" />
              ) : (
                <p className="text-3xl font-bold">{Object.keys(subjectToScores).length}</p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Average Scores by Subject</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : subjectRows.length === 0 ? (
              <div className="h-[120px] flex items-center justify-center text-muted-foreground">
                No data available yet
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Subject</TableHead>
                    <TableHead className="text-right">Average %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subjectRows.map((row) => (
                    <TableRow key={row.subject}>
                      <TableCell className="font-medium">{row.subject}</TableCell>
                      <TableCell className="text-right">{row.average}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Recent Results</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : results.length === 0 ? (
              <div className="h-[120px] flex items-center justify-center text-muted-foreground">
                No results yet
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Assessment</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                    <TableHead className="text-right">Submitted</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.slice(0, 10).map((r, idx) => {
                    const totalPoints = r.assessment?.totalPoints ?? r.assessment?.total_points ?? 0;
                    const pct = typeof r.percentage === 'number'
                      ? r.percentage
                      : (typeof r.score === 'number' && totalPoints > 0)
                        ? Math.round((r.score / totalPoints) * 100)
                        : 0;
                    const submittedAt = r.submittedAt ?? r.submitted_at;
                    return (
                      <TableRow key={idx}>
                        <TableCell>{r.student?.name ?? 'Student'}</TableCell>
                        <TableCell>{r.assessment?.title ?? 'Assessment'}</TableCell>
                        <TableCell>{r.assessment?.subject ?? '-'}</TableCell>
                        <TableCell className="text-right">{pct}%</TableCell>
                        <TableCell className="text-right">{submittedAt ? new Date(submittedAt).toLocaleDateString() : '-'}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}