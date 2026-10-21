'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronDown, CircleHelp, Eye, Loader2, Presentation, Target } from 'lucide-react';

import { MarkdownContent } from '@/components/content/MarkdownContent';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { LessonIntroduction } from '@/components/lessons/LessonIntroduction';
import { LearningArtifactCard } from '@/components/students/study-companion/LearningArtifactCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { formatGradeLevel } from '@/lib/lesson-record';
import type { StudentLessonDetail } from '@/lib/lesson-artifacts/student-learning';
import type { ObjectiveLearningArtifact } from '@/lib/lesson-artifacts/objective-learning-controller';

type Preview = {
  detail: StudentLessonDetail;
  materials: Record<string, ObjectiveLearningArtifact['artifact'][]>;
  missing: string[];
};

/** Shows a teacher what students get if the lesson is published now. Nothing is recorded. */
export default function StudentPreviewPage({ params }: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = use(params);
  const [preview, setPreview] = useState<Preview>();
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string>();

  const load = useCallback(async () => {
    setError('');
    try {
      const response = await fetch(`/api/teachers/lessons/${lessonId}/student-preview`, { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'The preview could not be loaded.');
      setPreview(body);
      setOpen(current => current ?? body.detail.objectives[0]?.id);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'The preview could not be loaded.');
    }
  }, [lessonId]);
  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  const lesson = preview?.detail.lesson;
  return (
    <DashboardLayout>
      <div className="mx-auto max-w-5xl space-y-6 p-3 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          <p className="flex items-center gap-2"><Eye className="h-4 w-4 text-primary" /><span><strong>Student preview.</strong> This is what students get when you publish now: approved materials only. Nothing here is saved.</span></p>
          <Button variant="outline" size="sm" asChild><Link href={`/teachers/lessons/${lessonId}?tab=studio`}><ArrowLeft className="mr-2 h-4 w-4" />Back to Studio</Link></Button>
        </div>

        {error && <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center"><p className="text-sm text-destructive">{error}</p><Button variant="outline" onClick={() => void load()}>Try again</Button></div>}
        {!preview && !error && <div role="status" className="flex min-h-64 items-center justify-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Building the preview…</div>}

        {preview && lesson && <>
          {preview.missing.length > 0 && <p role="status" className="rounded-xl bg-amber-500/10 p-4 text-sm">Not ready to publish yet. Still needed: {preview.missing.join(', ')}.</p>}
          <div>
            <h1 className="text-3xl font-bold break-words">{lesson.title}</h1>
            <p className="text-muted-foreground">{lesson.subject} • {formatGradeLevel(lesson.gradeLevel)}</p>
          </div>
          <LessonIntroduction lessonId={lessonId} />
          <section className="rounded-2xl border bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-4 text-white sm:p-6">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-lime-300"><Target className="h-4 w-4" /> Objective roadmap</div>
            <h2 className="text-2xl font-semibold leading-tight">Learn one clear outcome at a time.</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Students start an AI tutor session for each objective. The tutor uses the materials below, in this order, before creating anything new.</p>
          </section>

          <div className="space-y-3">
            {preview.detail.objectives.map((objective, index) => {
              const items = preview.materials[objective.id] ?? [];
              const expanded = open === objective.id;
              return <Card key={objective.id} className="overflow-hidden">
                <button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? undefined : objective.id)} className="grid w-full gap-4 p-4 text-left sm:p-5 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-sm font-bold text-lime-300 dark:bg-lime-300 dark:text-slate-950">{String(index + 1).padStart(2, '0')}</span>
                  <span className="min-w-0">
                    <span className="block font-medium leading-6 break-words">{objective.text}</span>
                    <span className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-2.5 py-1"><Presentation className="h-3.5 w-3.5" />{objective.artifactCounts.visualizations} visual{objective.artifactCounts.visualizations === 1 ? '' : 's'}</span>
                      <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-2.5 py-1"><CircleHelp className="h-3.5 w-3.5" />{objective.artifactCounts.quizzes} quiz{objective.artifactCounts.quizzes === 1 ? '' : 'zes'}</span>
                    </span>
                  </span>
                  <ChevronDown className={`h-5 w-5 justify-self-end text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />
                </button>
                {expanded && <CardContent className="border-t bg-muted/20 p-3 sm:p-5">
                  {items.length
                    ? items.map(artifact => <LearningArtifactCard key={artifact.id} preview attachment={{ artifact, instanceId: artifact.id, source: 'teacher_approved', exhausted: false }} />)
                    : <p className="text-sm text-muted-foreground">No approved materials yet. Students would get AI-made activities for this objective during their session.</p>}
                </CardContent>}
              </Card>;
            })}
            {!preview.detail.objectives.length && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">This lesson has no objectives yet.</p>}
          </div>

          {lesson.content && <section><h2 className="mb-2 font-semibold">Lesson text</h2><MarkdownContent>{lesson.content}</MarkdownContent></section>}
        </>}
      </div>
    </DashboardLayout>
  );
}
