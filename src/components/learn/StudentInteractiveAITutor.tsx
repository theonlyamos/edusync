'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { LessonContext } from '@/hooks/useAudioStreaming';
import { TutorExperience } from '@/components/learn/tutor/TutorExperience';
import { useObjectiveLearning } from '@/hooks/useObjectiveLearning';
import type { StudentLessonDetail } from '@/lib/lesson-artifacts/student-learning';
import { Button } from '@/components/ui/button';

type StudentInteractiveAITutorProps = {
  onSessionStarted?: (sessionId: string) => void;
  onSessionEnded?: (sessionId: string | null) => void;
  initialLessonContext?: LessonContext;
};

export const StudentInteractiveAITutorComponent = ({ onSessionStarted, onSessionEnded, initialLessonContext }: StudentInteractiveAITutorProps) => {
  const searchParams = useSearchParams();
  const debugMode = searchParams.get('debug') === 'true';
  const getFeedback = searchParams.get('getFeedback') === 'true';

  const lessonIdFromUrl = searchParams.get('lessonId');
  const objectiveIdFromUrl = searchParams.get('objectiveId');
  const objectiveLearning = useObjectiveLearning({
    lessonId: lessonIdFromUrl,
    objectiveId: objectiveIdFromUrl,
    mode: 'tutor',
  });

  const [lessonDetail, setLessonDetail] = useState<StudentLessonDetail | null>(null);
  const [lessonLoading, setLessonLoading] = useState(!!lessonIdFromUrl);
  const [lessonError, setLessonError] = useState<string | null>(null);

  // Fetch lesson content if lessonId is provided
  useEffect(() => {
    const fetchLessonContent = async () => {
      if (!lessonIdFromUrl) {
        setLessonLoading(false);
        return;
      }

      try {
        setLessonLoading(true);
        setLessonError(null);
        const response = await fetch(`/api/students/lessons/${lessonIdFromUrl}`);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Failed to load lesson');
        setLessonDetail(data);
      } catch (error) {
        console.error('Failed to fetch lesson:', error);
        setLessonError(error instanceof Error ? error.message : 'Failed to load lesson');
      } finally {
        setLessonLoading(false);
      }
    };

    fetchLessonContent();
  }, [lessonIdFromUrl]);

  const lessonContext = useMemo<LessonContext | undefined>(() => {
    if (!lessonDetail) return initialLessonContext;
    return {
      lessonId: lessonDetail.lesson.id,
      title: lessonDetail.lesson.title,
      subject: lessonDetail.lesson.subject,
      gradeLevel: lessonDetail.lesson.gradeLevel,
      objectives: lessonDetail.objectives.map((objective) => objective.text),
      content: lessonDetail.lesson.content ?? undefined,
      learningRunId: objectiveLearning.runId ?? undefined,
      activeObjective: objectiveLearning.activeObjective ?? undefined,
    };
  }, [initialLessonContext, lessonDetail, objectiveLearning.activeObjective, objectiveLearning.runId]);

  if (lessonLoading || objectiveLearning.loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-700">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading lesson...</p>
        </div>
      </div>
    );
  }

  const blockingError = lessonError || objectiveLearning.error;
  if (lessonIdFromUrl && blockingError && !lessonContext?.learningRunId) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 p-6 text-white">
        <div className="w-full max-w-md rounded-3xl border border-amber-300/20 bg-white/5 p-7 text-center shadow-2xl">
          <AlertTriangle className="mx-auto h-10 w-10 text-amber-300" />
          <h1 className="mt-4 text-xl font-semibold">Tutor session unavailable</h1>
          <p className="mt-2 text-sm leading-6 text-slate-300">{blockingError}</p>
          <div className="mt-6 flex justify-center gap-3">
            <Button onClick={() => window.location.reload()}>Try again</Button>
            <Button variant="outline" className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white" onClick={() => window.location.assign(`/students/lessons/${lessonIdFromUrl}`)}>Back to lesson</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <TutorExperience
      variant="student"
      apiKey={null}
      getFeedback={getFeedback}
      debugMode={debugMode}
      initialTopic={lessonContext?.activeObjective?.text || lessonContext?.title || null}
      lessonContext={lessonContext}
      objectiveLearning={lessonContext?.learningRunId ? objectiveLearning : undefined}
      onSessionStarted={onSessionStarted}
      onSessionEnded={onSessionEnded}
    />
  );
};

export default function StudentInteractiveAITutor(props: StudentInteractiveAITutorProps) {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center"><Loader2 className="w-12 h-12 animate-spin" /></div>}>
      <StudentInteractiveAITutorComponent {...props} />
    </Suspense>
  );
}
