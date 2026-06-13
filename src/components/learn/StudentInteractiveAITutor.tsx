'use client';

import { useEffect, useState, Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { LessonContext } from '@/hooks/useAudioStreaming';
import { TutorExperience } from '@/components/learn/tutor/TutorExperience';

type StudentInteractiveAITutorProps = {
  onSessionStarted?: (sessionId: string) => void;
  onSessionEnded?: (sessionId: string | null) => void;
  initialLessonContext?: LessonContext;
};

export const StudentInteractiveAITutorComponent = ({ onSessionStarted, onSessionEnded, initialLessonContext }: StudentInteractiveAITutorProps) => {
  const searchParams = useSearchParams();
  const debugMode = searchParams.get('debug') === 'true';
  const getFeedback = searchParams.get('getFeedback') === 'true';

  // Parse lesson context from URL params
  const lessonIdFromUrl = searchParams.get('lessonId');
  const lessonTitleFromUrl = searchParams.get('lessonTitle');
  const lessonSubjectFromUrl = searchParams.get('lessonSubject');
  const lessonGradeFromUrl = searchParams.get('lessonGrade');
  const lessonObjectivesFromUrl = searchParams.get('lessonObjectives');

  const [lessonContext, setLessonContext] = useState<LessonContext | undefined>(initialLessonContext);
  const [lessonLoading, setLessonLoading] = useState(!!lessonIdFromUrl);

  // Fetch lesson content if lessonId is provided
  useEffect(() => {
    const fetchLessonContent = async () => {
      if (!lessonIdFromUrl) {
        setLessonLoading(false);
        return;
      }

      try {
        setLessonLoading(true);
        const response = await fetch(`/api/lessons/${lessonIdFromUrl}`);
        if (response.ok) {
          const lesson = await response.json();
          const context: LessonContext = {
            lessonId: lessonIdFromUrl,
            title: lesson.title,
            subject: lesson.subject,
            gradeLevel: lesson.gradelevel,
            objectives: lesson.objectives,
            content: lesson.content,
          };
          setLessonContext(context);
        }
      } catch (error) {
        console.error('Failed to fetch lesson:', error);
        // Fall back to URL params if fetch fails
        if (lessonTitleFromUrl) {
          setLessonContext({
            lessonId: lessonIdFromUrl,
            title: lessonTitleFromUrl,
            subject: lessonSubjectFromUrl || undefined,
            gradeLevel: lessonGradeFromUrl || undefined,
            objectives: lessonObjectivesFromUrl || undefined,
          });
        }
      } finally {
        setLessonLoading(false);
      }
    };

    fetchLessonContent();
  }, [lessonIdFromUrl]);

  // Show loading state while fetching lesson
  if (lessonLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-700">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading lesson...</p>
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
      initialTopic={lessonTitleFromUrl || lessonContext?.title || null}
      lessonContext={lessonContext}
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
