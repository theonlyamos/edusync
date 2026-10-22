'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, BookOpen, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { formatGrade } from '@/lib/grade';

export const dynamic = 'force-dynamic';

interface Lesson {
  id: string;
  title: string;
  subject: string;
  gradelevel: string;
  objectives: string[];
  created_at: string;
}

const PREVIEW_OBJECTIVES = 2;

export default function StudentLessonsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);

  const fetchLessons = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/students/lessons');
      if (!response.ok) throw new Error('Failed to fetch lessons');
      setLessons(await response.json());
    } catch (fetchError) {
      console.error('Error fetching lessons:', fetchError);
      setError('Your lessons could not be loaded. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchLessons();
  }, [fetchLessons]);

  return (
    <DashboardLayout>
      <div className="p-3 sm:p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground sm:text-3xl">My lessons</h1>
          <p className="text-muted-foreground">Lessons your teachers have published for your class.</p>
        </div>

        {loading ? (
          <div role="status" className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading your lessons…
          </div>
        ) : error ? (
          <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-xl border border-dashed p-8 text-center">
            <AlertTriangle className="h-8 w-8 text-amber-500" />
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" onClick={() => void fetchLessons()}>Try again</Button>
          </div>
        ) : lessons.length === 0 ? (
          <div className="py-12 text-center">
            <h2 className="mb-2 text-lg font-semibold">No lessons yet</h2>
            <p className="text-muted-foreground">When your teacher publishes a lesson for your class, it will appear here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2 xl:grid-cols-3">
            {lessons.map((lesson) => {
              const objectives = Array.isArray(lesson.objectives) ? lesson.objectives : [];
              const more = objectives.length - PREVIEW_OBJECTIVES;
              return (
                <Link href={`/students/lessons/${lesson.id}`} key={lesson.id} className="min-w-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Card className="flex h-full cursor-pointer flex-col transition-shadow hover:shadow-lg">
                    <CardHeader>
                      <CardTitle className="break-words">{lesson.title}</CardTitle>
                      <CardDescription className="break-words">
                        {lesson.subject} · {formatGrade(lesson.gradelevel)}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1">
                      {objectives.length > 0 ? (
                        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                          {objectives.slice(0, PREVIEW_OBJECTIVES).map((objective, index) => (
                            <li key={index} className="line-clamp-2">{objective}</li>
                          ))}
                          {more > 0 && <li className="list-none text-xs">+{more} more objective{more === 1 ? '' : 's'}</li>}
                        </ul>
                      ) : (
                        <p className="text-sm text-muted-foreground">No objectives listed.</p>
                      )}
                    </CardContent>
                    <CardFooter className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm text-muted-foreground">
                        Added {new Date(lesson.created_at).toLocaleDateString()}
                      </p>
                      <span className="inline-flex items-center text-sm font-medium text-primary">
                        <BookOpen className="mr-2 h-4 w-4" /> Open <ArrowRight className="ml-1 h-4 w-4" />
                      </span>
                    </CardFooter>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
