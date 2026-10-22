'use client';

import { LessonIntroduction } from '@/components/lessons/LessonIntroduction';

import { useState, useEffect, use, useCallback, useContext } from 'react';
import { useRouter } from 'next/navigation';
import { SupabaseSessionContext } from '@/components/providers/SupabaseAuthProvider';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { PracticeExercise } from '@/components/practice/PracticeExercise';
import { ArrowLeft, Check, CircleHelp, FileCheck, Loader2, PenLine, Play, Presentation, Sparkles, Target } from 'lucide-react';
import { formatGrade } from '@/lib/grade';
import Link from 'next/link';
import type { StudentLessonDetail } from '@/lib/lesson-artifacts/student-learning';
import { LessonResourceList } from '@/components/resources/LessonResourceList';
import type { LessonResource } from '@/lib/lesson-resources';

export default function LessonPage({ params }: { params: Promise<{ lessonId: string }> }) {
  const resolvedParams = use(params);
  const session = useContext(SupabaseSessionContext);
  const router = useRouter();
  const { toast } = useToast();
  const [lessonDetail, setLessonDetail] = useState<StudentLessonDetail | null>(null);
  const [lessonError, setLessonError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [practicing, setPracticing] = useState(false);
  const [questions, setQuestions] = useState<any[]>([]);
  // Which practice is being made: 'lesson', an objective id, or nothing.
  const [generatingPractice, setGeneratingPractice] = useState<string | null>(null);
  const [practiceFocus, setPracticeFocus] = useState<string | null>(null);
  const [resources, setResources] = useState<LessonResource[] | null>(null);
  const lesson = lessonDetail?.lesson ?? null;

  const fetchLesson = useCallback(async () => {
    try {
      setLoading(true);
      setLessonError(null);
      const response = await fetch(`/api/students/lessons/${resolvedParams.lessonId}`);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Failed to fetch lesson');
      setLessonDetail(body as StudentLessonDetail);
      return true;
    } catch (error) {
      console.error('Error fetching lesson:', error);
      setLessonError(error instanceof Error ? error.message : 'Failed to load lesson details');
      return false;
    } finally {
      setLoading(false);
    }
  }, [resolvedParams.lessonId]);

  useEffect(() => {
    if (resolvedParams.lessonId) void fetchLesson();
  }, [fetchLesson, resolvedParams.lessonId]);

  // Resources load on their own so a slow or failed request never blocks the lesson.
  useEffect(() => {
    if (!resolvedParams.lessonId) return;
    let cancelled = false;
    fetch(`/api/resources?lessonId=${resolvedParams.lessonId}`)
      .then((response) => (response.ok ? response.json() : []))
      .then((data) => { if (!cancelled) setResources(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) setResources([]); });
    return () => { cancelled = true; };
  }, [resolvedParams.lessonId]);

  // objectiveId: practise one objective; undefined: the whole lesson.
  const handleStartPractice = async (objectiveId?: string) => {
    if (!lesson) return;
    setPracticeFocus(objectiveId ?? null);
    setGeneratingPractice(objectiveId ?? 'lesson');
    setPracticing(false);
    setQuestions([]);

    try {
      const response = await fetch('/api/students/practice/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonId: lesson.id, objectiveId, type: 'standard' }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || data.message || 'Practice questions could not be made. Please try again.');
      }
      if (data.questions?.length) {
        setQuestions(data.questions);
        setPracticing(true);
      } else {
        throw new Error('No practice questions came back. Please try again.');
      }
    } catch (error) {
      console.error('Error generating practice:', error);
      toast({
        title: 'Practice not ready',
        description: error instanceof Error ? error.message : 'Practice questions could not be made. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setGeneratingPractice(null);
    }
  };

  const handleRetry = () => {
    setPracticing(false);
    setTimeout(() => setPracticing(true), 0); 
  };

  const handleGenerateNew = () => {
    void handleStartPractice(practiceFocus ?? undefined);
  };

  const handleLearnWithAI = (objectiveId?: string) => {
    if (!lesson) return;
    const selectedObjectiveId = objectiveId ?? lessonDetail?.objectives[0]?.id;
    if (!selectedObjectiveId) return;
    const params = new URLSearchParams({
      lessonId: resolvedParams.lessonId,
      objectiveId: selectedObjectiveId,
    });
    router.push(`/students/learn?${params.toString()}`);
  };

  if (loading || !session) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  if (!lesson) {
    return (
      <DashboardLayout>
        <div className="mx-auto flex min-h-[70vh] max-w-xl items-center p-6">
          <Card className="w-full border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20">
            <CardHeader>
              <CardTitle>Lesson unavailable</CardTitle>
              <CardDescription>{lessonError || 'This lesson could not be found.'}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button onClick={fetchLesson}>Try again</Button>
              <Button variant="outline" onClick={() => window.location.assign('/students/lessons')}>Back to lessons</Button>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  if (practicing) {
    return (
      <DashboardLayout>
        <div className="p-3 sm:p-6 max-w-4xl mx-auto">
          <div className="mb-6">
            <Button 
              variant="outline" 
              onClick={() => setPracticing(false)}
              className="mb-4 min-h-11 xl:min-h-0"
            >
              Back to Lesson
            </Button>
            <h2 className="text-2xl font-bold break-words">{lesson.title} - Practice</h2>
          </div>
          {questions.length > 0 ? (
            <PracticeExercise
              subject={lesson.subject}
              topic={lesson.title}
              questions={questions}
              onRetry={handleRetry}
              onGenerateNew={handleGenerateNew}
            />
          ) : (
            <Card>
              <CardContent className="p-6 text-center">
                <p>Loading questions or no questions generated.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </DashboardLayout>
    );
  }

  const objectives = lessonDetail?.objectives ?? [];
  const mastered = new Set(lessonDetail?.masteredObjectiveIds ?? []);
  const masteredCount = objectives.filter((objective) => mastered.has(objective.id)).length;
  const nextObjective = objectives.find((objective) => !mastered.has(objective.id)) ?? objectives[0];

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-4xl space-y-6 p-3 sm:p-6">
        <header className="space-y-3">
          <Link href="/students/lessons" className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground xl:min-h-0">
            <ArrowLeft className="h-4 w-4" /> Lessons
          </Link>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="break-words text-2xl font-bold tracking-tight sm:text-3xl">{lesson.title}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {lesson.subject} · {formatGrade(lesson.gradeLevel)}
                {objectives.length > 0 && ` · ${masteredCount} of ${objectives.length} objectives done`}
              </p>
            </div>
            <Button asChild variant="outline" size="sm" className="min-h-11 xl:min-h-0">
              <Link href={`/students/homework?lessonId=${resolvedParams.lessonId}`}>
                <FileCheck className="mr-2 h-4 w-4" /> Homework
              </Link>
            </Button>
          </div>
        </header>

        <LessonIntroduction lessonId={resolvedParams.lessonId} />

        <section className="overflow-hidden rounded-2xl border bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 text-white shadow-sm">
          <div className="grid gap-4 p-4 sm:gap-6 sm:p-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <div className="min-w-0">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-lime-300 sm:tracking-[0.22em]">
                <Target className="h-4 w-4 shrink-0" /> Objective roadmap
              </div>
              <h2 className="max-w-2xl text-2xl font-semibold leading-tight">Learn one clear outcome at a time.</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                {nextObjective && masteredCount > 0 && masteredCount < objectives.length
                  ? `Up next: ${nextObjective.text}`
                  : "The AI tutor works through each objective with your teacher's reviewed activities."}
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row md:flex-col">
              <Button className="min-h-11 bg-lime-300 text-slate-950 hover:bg-lime-200 xl:min-h-0" onClick={() => handleLearnWithAI(nextObjective?.id)} disabled={!objectives.length}>
                <Play className="mr-2 h-4 w-4 fill-current" /> {masteredCount > 0 ? 'Continue with AI tutor' : 'Start with AI tutor'}
              </Button>
              <Button variant="outline" className="min-h-11 border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white xl:min-h-0" onClick={() => void handleStartPractice()} disabled={generatingPractice !== null}>
                {generatingPractice === 'lesson' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PenLine className="mr-2 h-4 w-4" />}
                {generatingPractice === 'lesson' ? 'Making practice…' : 'Practise this lesson'}
              </Button>
            </div>
          </div>
        </section>

        <ol className="space-y-3" aria-label="Lesson objectives">
          {objectives.map((objective, index) => {
            const done = mastered.has(objective.id);
            return (
              <li key={objective.id}>
                <Card className={done ? 'border-emerald-300/70 dark:border-emerald-800' : undefined}>
                  <CardContent className="grid gap-4 p-4 sm:p-5 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center">
                    <div className={`flex h-11 w-11 items-center justify-center rounded-2xl text-sm font-bold shadow-sm ${done ? 'bg-emerald-600 text-white' : 'bg-slate-950 text-lime-300 dark:bg-lime-300 dark:text-slate-950'}`}>
                      {done ? <Check className="h-5 w-5" aria-label="Done" /> : String(index + 1).padStart(2, '0')}
                    </div>
                    <div className="min-w-0">
                      <p className="break-words font-medium leading-6 text-foreground">{objective.text}</p>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        {done && <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">Mastered</span>}
                        <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-2.5 py-1"><Presentation className="h-3.5 w-3.5" />{objective.artifactCounts.visualizations} visual{objective.artifactCounts.visualizations === 1 ? '' : 's'}</span>
                        <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-2.5 py-1"><CircleHelp className="h-3.5 w-3.5" />{objective.artifactCounts.quizzes} quiz{objective.artifactCounts.quizzes === 1 ? '' : 'zes'}</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row md:flex-col">
                      <Button variant={done ? 'outline' : 'default'} className="min-h-11 w-full md:w-auto xl:min-h-0" onClick={() => handleLearnWithAI(objective.id)}>
                        <Sparkles className="mr-2 h-4 w-4" /> {done ? 'Review with AI' : 'Learn with AI'}
                      </Button>
                      <Button variant="ghost" className="min-h-11 w-full md:w-auto xl:min-h-0" onClick={() => void handleStartPractice(objective.id)} disabled={generatingPractice !== null}>
                        {generatingPractice === objective.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PenLine className="mr-2 h-4 w-4" />}
                        Practise
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ol>
        {!objectives.length && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Your teacher hasn&apos;t published objectives for this lesson yet.</p>}

        {resources && resources.length > 0 && (
          <section className="space-y-3" aria-labelledby="lesson-resources-heading">
            <h2 id="lesson-resources-heading" className="text-lg font-semibold">Resources</h2>
            <LessonResourceList resources={resources} />
          </section>
        )}
      </div>
    </DashboardLayout>
  );
}
