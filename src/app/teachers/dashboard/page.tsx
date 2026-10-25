'use client';

import { useContext, useMemo } from 'react';
import Link from 'next/link';
import { CalendarClock, ClipboardCheck } from 'lucide-react';
import { SupabaseSessionContext } from '@/components/providers/SupabaseAuthProvider';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import {
  DashboardEmpty,
  DashboardSection,
  DashboardStats,
} from '@/components/dashboard/DashboardParts';
import { useHomeworkData } from '@/components/homework/shared';
import { useAllHomework } from '@/components/dashboard/useAllHomework';
import {
  LessonPipelineSection,
  StudentsBehindSection,
  WeakObjectivesSection,
} from '@/components/dashboard/TeacherInsights';
import type { TeacherDashboardData } from '@/lib/dashboard-server';
import { TeacherSubjectsSection, type MySubject } from '@/components/dashboard/TeacherSubjectsSection';
import { SchoolCreditsCard } from '@/components/dashboard/CreditWidgets';
import type { CreditSummary } from '@/lib/school-billing.server';
import { useLiveClassJoinTick } from '@/hooks/useLiveClassJoinTick';
import { getClientLiveClassLobbyMinutes, liveClassJoinStatesByEventId } from '@/lib/live-class-window';
import {
  formatWhen,
  liveClassLessonTitle,
  teacherHomeworkSummary,
  upcomingLiveClasses,
  type DashboardLiveClass,
} from '@/lib/dashboard';

export const dynamic = 'force-dynamic';

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export default function TeacherDashboard() {
  const session = useContext(SupabaseSessionContext);
  const homework = useAllHomework();
  const live = useHomeworkData<{ items: DashboardLiveClass[] }>('/api/live-classes');
  const insights = useHomeworkData<TeacherDashboardData>('/api/dashboard/teacher');
  const credits = useHomeworkData<CreditSummary>('/api/credits/summary');
  const subjects = useHomeworkData<{ mine: MySubject[] }>('/api/teachers/subjects');
  const joinTick = useLiveClassJoinTick();
  const lobbyMinutes = getClientLiveClassLobbyMinutes();
  const userId = session?.user?.id;

  const now = useMemo(() => new Date(), [joinTick, live.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const summary = useMemo(() => teacherHomeworkSummary(homework.items ?? []), [homework.items]);
  const upcoming = useMemo(
    () => upcomingLiveClasses(live.data?.items ?? [], now, { organizerId: userId }),
    [live.data, now, userId]
  );
  const joinById = useMemo(
    () => liveClassJoinStatesByEventId(upcoming, lobbyMinutes, now),
    [upcoming, lobbyMinutes, now]
  );

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <h2 className="text-2xl font-semibold mb-2">Loading...</h2>
          <p className="text-muted-foreground">Please wait while we load your dashboard</p>
        </div>
      </div>
    );
  }

  const name = (session.user.user_metadata?.name as string | undefined)?.trim();

  return (
    <DashboardLayout>
      <div>
        <h2 className="text-3xl font-bold text-foreground mb-2 break-words">
          {name ? `Welcome back, ${name}` : 'Teacher dashboard'}
        </h2>
        <p className="text-muted-foreground mb-6">Here&apos;s what needs your attention.</p>

        <DashboardStats
          items={[
            {
              label: 'Submissions to mark',
              value: homework.loading ? '…' : homework.error ? '–' : summary.needMarking,
              href: '/teachers/homework',
            },
            {
              label: 'Marked, not yet released',
              value: homework.loading ? '…' : homework.error ? '–' : summary.readyToRelease,
              detail: 'Students can’t see these marks yet',
              href: '/teachers/homework',
            },
            {
              label: 'Open homework',
              value: homework.loading ? '…' : homework.error ? '–' : summary.open,
              detail: summary.drafts ? plural(summary.drafts, 'draft') : undefined,
              href: '/teachers/homework',
            },
          ]}
        />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
          <DashboardSection
            title="Needs your attention"
            icon={<ClipboardCheck className="h-5 w-5 text-primary" />}
            href="/teachers/homework"
            loading={homework.loading}
            error={homework.error}
            retry={homework.refresh}
          >
            {summary.attention.length === 0 ? (
              <DashboardEmpty>
                You&apos;re all caught up. Submitted homework that needs marking will show up here.
              </DashboardEmpty>
            ) : (
              <ul className="divide-y">
                {summary.attention.slice(0, 5).map(({ item, needMarking, readyToRelease }) => (
                  <li key={item.homework.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-medium break-words">{item.homework.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {[
                          needMarking ? `${needMarking} to mark` : null,
                          readyToRelease ? `${readyToRelease} ready to release` : null,
                          `${item.submitted}/${item.assigned} submitted`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" className="min-h-11 shrink-0 xl:min-h-0" asChild>
                      <Link href={`/teachers/homework/${item.homework.id}${needMarking ? '/mark' : ''}`}>
                        {needMarking ? 'Mark' : 'Review'}
                      </Link>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </DashboardSection>

          <DashboardSection
            title="Your upcoming live classes"
            icon={<CalendarClock className="h-5 w-5 text-primary" />}
            href="/teachers/live"
            loading={live.loading}
            error={live.error}
            retry={live.refresh}
          >
            {upcoming.length === 0 ? (
              <DashboardEmpty>No live classes scheduled.</DashboardEmpty>
            ) : (
              <ul className="divide-y">
                {upcoming.slice(0, 4).map((c) => {
                  const lesson = liveClassLessonTitle(c.lessons);
                  return (
                    <li key={c.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="font-medium break-words">{c.title}</p>
                        <p className="text-sm text-muted-foreground break-words">
                          {c.status === 'live' ? 'Live now' : formatWhen(c.scheduled_start_at, now)}
                          {lesson ? ` · ${lesson}` : ''}
                        </p>
                      </div>
                      {joinById.get(c.id)?.joinAllowed && (
                        <Button size="sm" className="min-h-11 shrink-0 xl:min-h-0" asChild>
                          <Link href={`/teachers/live/${c.id}`}>Open room</Link>
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </DashboardSection>

          <SchoolCreditsCard request={credits} now={now} />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
          <StudentsBehindSection request={insights} />
          <WeakObjectivesSection request={insights} />
          <LessonPipelineSection request={insights} />
          <TeacherSubjectsSection request={subjects} />
        </div>

      </div>
    </DashboardLayout>
  );
}
