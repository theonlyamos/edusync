'use client';

import { useContext, useMemo } from 'react';
import Link from 'next/link';
import { BookOpen, Brain, CalendarClock, MessagesSquare, NotebookPen } from 'lucide-react';
import { SupabaseSessionContext } from '@/components/providers/SupabaseAuthProvider';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DashboardEmpty,
  DashboardSection,
  DashboardStats,
  QuickLinkCard,
} from '@/components/dashboard/DashboardParts';
import { useHomeworkData } from '@/components/homework/shared';
import { useAllHomework } from '@/components/dashboard/useAllHomework';
import { useStudentProfile } from '@/hooks/useStudentProfile';
import { useLiveClassJoinTick } from '@/hooks/useLiveClassJoinTick';
import { resolveStudentDisplayName } from '@/lib/student-profile';
import { getClientLiveClassLobbyMinutes, liveClassJoinStatesByEventId } from '@/lib/live-class-window';
import {
  formatWhen,
  liveClassLessonTitle,
  studentFeedbackReady,
  studentHomeworkTasks,
  upcomingLiveClasses,
  type DashboardLiveClass,
  type StudentHomeworkState,
} from '@/lib/dashboard';
import type { PracticeStats } from '@/lib/practice-stats';

export const dynamic = 'force-dynamic';

const STATE_LABEL: Record<StudentHomeworkState, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  revision_requested: 'Revision requested',
};

export default function StudentDashboard() {
  const session = useContext(SupabaseSessionContext);
  const { data: profile } = useStudentProfile(session?.user?.id);
  const homework = useAllHomework();
  const live = useHomeworkData<{ items: DashboardLiveClass[] }>('/api/live-classes');
  const practice = useHomeworkData<PracticeStats>('/api/students/practice/stats');
  const joinTick = useLiveClassJoinTick();
  const lobbyMinutes = getClientLiveClassLobbyMinutes();

  // joinTick re-runs time-based lists so "Join" turns on without a reload.
  const now = useMemo(() => new Date(), [joinTick, homework.items, live.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const tasks = useMemo(() => studentHomeworkTasks(homework.items ?? [], now), [homework.items, now]);
  const upcoming = useMemo(() => upcomingLiveClasses(live.data?.items ?? [], now), [live.data, now]);
  const joinById = useMemo(
    () => liveClassJoinStatesByEventId(upcoming, lobbyMinutes, now),
    [upcoming, lobbyMinutes, now]
  );

  if (!session) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  const displayName = resolveStudentDisplayName({
    profileName: profile?.name,
    metadataName: session.user.user_metadata?.name,
    email: profile?.email ?? session.user.email,
  });
  const feedbackReady = studentFeedbackReady(homework.items ?? []);
  const overdue = tasks.filter((t) => t.overdue).length;
  const nextClass = upcoming[0];
  const laterClasses = upcoming.slice(1, 3);

  return (
    <DashboardLayout>
      <div className="p-3 sm:p-6">
        <div className="mb-6">
          <h2 className="break-words text-2xl sm:text-3xl font-bold text-foreground">Welcome back, {displayName}!</h2>
          <p className="text-muted-foreground">Here&apos;s what&apos;s coming up for you.</p>
        </div>

        <DashboardStats
          items={[
            {
              label: 'Homework to do',
              value: homework.loading ? '…' : homework.error ? '–' : tasks.length,
              detail: overdue ? `${overdue} past the due date` : undefined,
              href: '/students/homework',
            },
            {
              label: 'Feedback ready',
              value: homework.loading ? '…' : homework.error ? '–' : feedbackReady,
              href: '/students/homework/performance',
            },
            {
              label: 'Practice average',
              value: practice.loading
                ? '…'
                : practice.data?.totalExercisesCompleted
                  ? `${practice.data.averageScore}%`
                  : '–',
              detail: practice.loading
                ? undefined
                : practice.error
                  ? 'Couldn’t load practice stats'
                  : practice.data?.totalExercisesCompleted
                    ? `${practice.data.totalExercisesCompleted} exercise${practice.data.totalExercisesCompleted === 1 ? '' : 's'} completed`
                    : 'No practice yet',
              href: '/students/practice',
            },
          ]}
        />

        <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
          <DashboardSection
            title="Homework due soon"
            icon={<NotebookPen className="h-5 w-5 text-primary" />}
            href="/students/homework"
            loading={homework.loading}
            error={homework.error}
            retry={homework.refresh}
          >
            {tasks.length === 0 ? (
              <DashboardEmpty>You&apos;re all caught up. New homework from your teachers will show up here.</DashboardEmpty>
            ) : (
              <ul className="divide-y">
                {tasks.slice(0, 4).map((t) => (
                  <li key={t.item.homework.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-medium break-words">{t.item.homework.title}</p>
                      <p className="text-sm text-muted-foreground break-words">
                        {t.item.homework.subject} ·{' '}
                        <span className={t.overdue ? 'text-destructive' : undefined}>
                          {t.overdue ? 'Was due' : 'Due'} {formatWhen(t.dueAt, now)}
                        </span>
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant={t.state === 'revision_requested' ? 'default' : 'outline'}>
                        {STATE_LABEL[t.state]}
                      </Badge>
                      <Button size="sm" variant="outline" className="min-h-11 xl:min-h-0" asChild>
                        <Link href={`/students/homework/${t.item.homework.id}`}>
                          {t.state === 'not_started' ? 'Start' : 'Continue'}
                        </Link>
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </DashboardSection>

          <DashboardSection
            title="Live classes"
            icon={<CalendarClock className="h-5 w-5 text-primary" />}
            href="/students/live"
            loading={live.loading}
            error={live.error}
            retry={live.refresh}
          >
            {!nextClass ? (
              <DashboardEmpty>No live classes scheduled. When your teacher schedules one for your grade, it will show up here.</DashboardEmpty>
            ) : (
              <div className="space-y-4">
                <div className="rounded-lg border p-4">
                  <p className="text-xs text-muted-foreground">
                    {nextClass.status === 'live' ? 'Happening now' : 'Next class'}
                  </p>
                  <p className="font-medium break-words">{nextClass.title}</p>
                  <p className="text-sm text-muted-foreground break-words">
                    {formatWhen(nextClass.scheduled_start_at, now)}
                    {liveClassLessonTitle(nextClass.lessons) ? ` · ${liveClassLessonTitle(nextClass.lessons)}` : ''}
                  </p>
                  {joinById.get(nextClass.id)?.joinAllowed ? (
                    <Button size="sm" className="mt-3 min-h-11 xl:min-h-0" asChild>
                      <Link href={`/students/live/${nextClass.id}`}>Join live session</Link>
                    </Button>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">{joinById.get(nextClass.id)?.joinHint}</p>
                  )}
                </div>
                {laterClasses.length > 0 && (
                  <ul className="space-y-1 text-sm">
                    {laterClasses.map((c) => (
                      <li key={c.id} className="flex justify-between gap-3">
                        <span className="min-w-0 break-words">{c.title}</span>
                        <span className="shrink-0 text-muted-foreground">{formatWhen(c.scheduled_start_at, now)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </DashboardSection>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-3">
          <QuickLinkCard
            title="My lessons"
            description="Open your lessons and learn with the AI tutor."
            icon={<BookOpen className="h-5 w-5 text-primary" />}
            href="/students/lessons"
            action="View lessons"
            accent="primary"
          />
          <QuickLinkCard
            title="Practice"
            description="Test yourself with quick exercises on any topic."
            icon={<Brain className="h-5 w-5 text-secondary" />}
            href="/students/practice"
            action="Start practice"
            accent="secondary"
          />
          <QuickLinkCard
            title="Study Companion"
            description="Plan, practice, review, and get tutor help on demand."
            icon={<MessagesSquare className="h-5 w-5 text-accent" />}
            href="/students/tutor"
            action="Open Study Companion"
            accent="accent"
          />
        </div>
      </div>
    </DashboardLayout>
  );
}
