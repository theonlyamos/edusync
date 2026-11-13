'use client';

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ArrowLeft, Loader2, Mic } from 'lucide-react';

import { RehearsalFlag } from '@/components/lessons/RehearsalFlag';
import { Button } from '@/components/ui/button';
import type { LessonContext } from '@/hooks/useAudioStreaming';
import type { StudentLessonDetail } from '@/lib/lesson-artifacts/student-learning';

// The voice tutor is heavy; load it only on this page.
const StudentInteractiveAITutor = dynamic(() => import('@/components/learn/StudentInteractiveAITutor'), {
  ssr: false,
  loading: () => <div className="flex h-dvh items-center justify-center bg-background"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden /></div>,
});

/**
 * Rehearse a lesson by voice: the same voice tutor students use, run on this
 * lesson as it stands now (drafts included), with a flag button whose notes
 * go to the co-author in the Studio.
 */
export default function VoiceRehearsalPage({ params }: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = use(params);
  const [detail, setDetail] = useState<StudentLessonDetail>();
  const [error, setError] = useState('');
  const [flagged, setFlagged] = useState(0);

  const load = useCallback(async () => {
    setError('');
    try {
      const response = await fetch(`/api/teachers/lessons/${lessonId}/student-preview`, { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'The lesson could not be loaded.');
      setDetail(body.detail);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'The lesson could not be loaded.');
    }
  }, [lessonId]);
  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  // No lessonId: nothing about this rehearsal is linked to the lesson's student records.
  const lessonContext = useMemo<LessonContext | undefined>(() => detail && {
    title: detail.lesson.title,
    subject: detail.lesson.subject,
    gradeLevel: detail.lesson.gradeLevel,
    objectives: detail.objectives.map(objective => objective.text),
    content: detail.lesson.content ?? undefined,
  }, [detail]);

  const studio = `/teachers/lessons/${lessonId}?tab=studio`;
  if (error) return <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
    <p role="alert" className="text-sm text-destructive">{error}</p>
    <div className="flex gap-2"><Button variant="outline" onClick={() => void load()}>Try again</Button><Button variant="ghost" asChild><Link href={studio}>Back to Studio</Link></Button></div>
  </div>;
  if (!lessonContext) return <div role="status" className="flex min-h-dvh items-center justify-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Loading the lesson…</div>;

  return <div className="relative">
    <StudentInteractiveAITutor initialLessonContext={lessonContext} back={{ href: studio, label: 'Back to Studio' }} />
    <aside aria-label="Voice rehearsal" className="fixed right-3 top-3 z-40 w-[min(22rem,calc(100vw-1.5rem))] space-y-2 rounded-xl border bg-background/95 p-3 text-sm shadow-lg backdrop-blur">
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-2 font-medium"><Mic aria-hidden className="h-4 w-4 text-primary" />Voice rehearsal</p>
        <Link href={studio} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft aria-hidden className="h-3.5 w-3.5" />Studio</Link>
      </div>
      <p className="hidden text-xs leading-relaxed text-muted-foreground sm:block">Talk to the tutor as a student would. It uses this lesson as it is now, even before you publish. 1 credit a minute from your school&apos;s pool.{flagged > 0 && ` ${flagged} flagged so far.`}</p>
      <RehearsalFlag lessonId={lessonId} where="Voice rehearsal" onAdded={() => setFlagged(count => count + 1)} />
    </aside>
  </div>;
}
