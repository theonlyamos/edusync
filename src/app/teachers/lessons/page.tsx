'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Archive, BookOpen, Loader2, Plus, RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { CreateLessonForm } from '@/components/lessons/CreateLessonForm';
import { LessonStatusBadge } from '@/components/lessons/LessonStatusBadge';
import { formatGradeLevel, formatLessonDate, lessonObjectiveList, lessonStatus } from '@/lib/lesson-record';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

interface Lesson {
  _id: string;
  title: string;
  subject: string;
  gradeLevel: string;
  objectives: string | string[];
  createdAt: string | null;
  current_publication_id?: string | null;
  archived_at?: string | null;
}

type View = 'active' | 'archived';
const PREVIEW_OBJECTIVES = 3;
const PAGE_SIZE = 24;

export default function LessonsPage() {
  const { toast } = useToast();
  const [view, setView] = useState<View>('active');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [restoringId, setRestoringId] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const lessonsUrl = (nextView: View, offset: number) =>
    `/api/lessons?limit=${PAGE_SIZE}&offset=${offset}${nextView === 'archived' ? '&archived=only' : ''}`;

  const fetchLessons = useCallback(async (nextView: View) => {
    setLoading(true);
    setLoadError('');
    try {
      const response = await fetch(lessonsUrl(nextView, 0));
      if (!response.ok) throw new Error('Your lessons could not be loaded.');
      setLessons(await response.json());
      setHasMore(response.headers.get('X-Has-More') === '1');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Your lessons could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const response = await fetch(lessonsUrl(view, lessons.length));
      if (!response.ok) throw new Error('More lessons could not be loaded.');
      const next: Lesson[] = await response.json();
      setLessons((current) => [...current, ...next.filter((l) => !current.some((c) => c._id === l._id))]);
      setHasMore(response.headers.get('X-Has-More') === '1');
    } catch (error) {
      toast({ title: 'Could not load more', description: (error as Error).message, variant: 'destructive' });
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => { queueMicrotask(() => void fetchLessons(view)); }, [fetchLessons, view]);

  const restore = async (lesson: Lesson) => {
    setRestoringId(lesson._id);
    try {
      const response = await fetch(`/api/teachers/lessons/${lesson._id}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: false }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'The lesson could not be restored.');
      toast({ title: 'Lesson restored', description: `"${lesson.title}" is back in your lessons.` });
      await fetchLessons(view);
    } catch (error) {
      toast({ title: 'Could not restore lesson', description: (error as Error).message, variant: 'destructive' });
    } finally {
      setRestoringId('');
    }
  };

  return (
    <DashboardLayout>
      <div className="p-3 sm:p-6">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold text-foreground">Lessons</h2>
            <p className="text-muted-foreground">Create and manage your lessons</p>
          </div>
          <Button onClick={() => setIsCreating(true)} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Create Lesson
          </Button>
        </div>

        <div role="tablist" aria-label="Lesson list" className="mb-6 inline-flex rounded-lg border bg-muted/40 p-1 text-sm">
          {(['active', 'archived'] as const).map((option) => (
            <button
              key={option}
              role="tab"
              aria-selected={view === option}
              onClick={() => setView(option)}
              className={cn(
                'rounded-md px-3 py-1.5 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                view === option ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {option === 'active' ? 'Lessons' : 'Archived'}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3" role="status" aria-label="Loading lessons">
            {Array.from({ length: 3 }, (_, index) => (
              <Card key={index}><CardHeader className="space-y-3"><Skeleton className="h-5 w-3/4" /><Skeleton className="h-4 w-1/3" /></CardHeader><CardContent className="space-y-2"><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-5/6" /></CardContent></Card>
            ))}
          </div>
        ) : loadError ? (
          <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center">
            <p className="text-sm text-destructive">{loadError}</p>
            <Button variant="outline" onClick={() => void fetchLessons(view)}>Try again</Button>
          </div>
        ) : lessons.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
            {view === 'active' ? <BookOpen className="h-8 w-8 text-muted-foreground" /> : <Archive className="h-8 w-8 text-muted-foreground" />}
            <h3 className="text-lg font-semibold">{view === 'active' ? 'No lessons yet' : 'No archived lessons'}</h3>
            <p className="max-w-md text-sm text-muted-foreground">
              {view === 'active'
                ? 'Create a lesson from a title and a few objectives. AI can draft the objectives for you, then help you build visuals and quizzes for each one.'
                : 'Lessons you archive appear here. Students cannot open them until you restore them.'}
            </p>
            {view === 'active' && <Button onClick={() => setIsCreating(true)}><Plus className="mr-2 h-4 w-4" />Create your first lesson</Button>}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {lessons.map((lesson) => {
              const objectives = lessonObjectiveList(lesson.objectives);
              const status = lessonStatus(lesson);
              const card = (
                <Card className={cn('flex h-full flex-col', status !== 'archived' && 'cursor-pointer transition-shadow hover:shadow-lg')}>
                  <CardHeader className="space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <CardTitle className="min-w-0 break-words">{lesson.title}</CardTitle>
                      <LessonStatusBadge status={status} className="shrink-0" />
                    </div>
                    <CardDescription>{lesson.subject} • {formatGradeLevel(lesson.gradeLevel)}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1">
                    {objectives.length ? (
                      <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                        {objectives.slice(0, PREVIEW_OBJECTIVES).map((objective, index) => <li key={index} className="line-clamp-2">{objective}</li>)}
                        {objectives.length > PREVIEW_OBJECTIVES && <li className="list-none text-xs">+{objectives.length - PREVIEW_OBJECTIVES} more</li>}
                      </ul>
                    ) : <p className="text-sm text-muted-foreground">No objectives yet</p>}
                  </CardContent>
                  <CardFooter className="flex items-center justify-between gap-3">
                    <p className="text-sm text-muted-foreground">Created {formatLessonDate(lesson.createdAt)}</p>
                    {status === 'archived' && (
                      <Button size="sm" variant="outline" disabled={restoringId === lesson._id} onClick={() => void restore(lesson)}>
                        {restoringId === lesson._id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
                        Restore
                      </Button>
                    )}
                  </CardFooter>
                </Card>
              );
              return status === 'archived'
                ? <div key={lesson._id}>{card}</div>
                : <Link href={`/teachers/lessons/${lesson._id}`} key={lesson._id} className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{card}</Link>;
            })}
          </div>
        )}

        {!loading && !loadError && hasMore && (
          <div className="mt-6 flex justify-center">
            <Button variant="outline" onClick={() => void loadMore()} disabled={loadingMore}>
              {loadingMore && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Show more lessons
            </Button>
          </div>
        )}

        {isCreating && (
          <CreateLessonForm
            onClose={() => {
              setIsCreating(false);
              void fetchLessons(view);
            }}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
