'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { BookOpen, CalendarClock, GraduationCap, MailWarning, UserPlus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DashboardEmpty, DashboardSection, DashboardStats } from '@/components/dashboard/DashboardParts';
import { SchoolCreditsCard } from '@/components/dashboard/CreditWidgets';
import { useHomeworkData } from '@/components/homework/shared';
import { SchoolSetupChecklist } from '@/components/school/SchoolSetupChecklist';
import { SchoolPageHeader, useSchoolPortal } from '@/components/school-portal/SchoolPortalProvider';
import { formatWhen } from '@/lib/dashboard';
import { gradeLevelLabel } from '@/lib/school-registration';
import { schoolRoleLabel } from '@/lib/school-people';
import type { CreditSummary } from '@/lib/school-billing.server';
import type { SchoolOverview } from '@/lib/school-overview.server';

function plural(n: number, word: string) {
  const many = word.endsWith('s') ? `${word}es` : word === 'person' ? 'people' : `${word}s`;
  return `${n.toLocaleString()} ${n === 1 ? word : many}`;
}

export default function SchoolDashboardPage() {
  const { school, reload } = useSchoolPortal();
  const overview = useHomeworkData<SchoolOverview>('/api/schools/current/overview');
  const credits = useHomeworkData<CreditSummary>('/api/credits/summary');
  const now = useMemo(() => new Date(), [overview.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const data = overview.data;
  const gradeCount = data?.studentsByGrade.filter((g) => g.grade !== 'none').length ?? 0;
  const maxInGrade = Math.max(1, ...(data?.studentsByGrade.map((g) => g.count) ?? [1]));

  return (
    <div>
      <SchoolPageHeader
        title={school.name}
        description="Everything about your school at a glance."
        actions={
          <>
            <Button asChild variant="outline"><Link href="/school/teachers?add=1"><UserPlus className="mr-2 h-4 w-4" />Add teacher</Link></Button>
            <Button asChild><Link href="/school/students?add=1"><UserPlus className="mr-2 h-4 w-4" />Add student</Link></Button>
          </>
        }
      />

      {!school.setupDismissedAt && (
        <div className="mb-6">
          <SchoolSetupChecklist onChanged={() => { void reload(); overview.refresh(); }} />
        </div>
      )}

      {overview.error ? (
        <p className="mb-6 text-sm text-destructive">{overview.error}</p>
      ) : (
        <DashboardStats
          items={[
            {
              label: 'Students',
              value: data ? data.people.students.toLocaleString() : '…',
              detail: data ? (gradeCount ? `In ${plural(gradeCount, 'grade')}` : 'No students yet') : undefined,
              href: '/school/students',
            },
            { label: 'Teachers', value: data ? data.people.teachers.toLocaleString() : '…', href: '/school/teachers' },
            {
              label: 'Administrators',
              value: data ? data.people.administrators.toLocaleString() : '…',
              detail: 'Including the owner',
              href: '/school/administrators',
            },
          ]}
        />
      )}

      {data && data.people.waitingToActivate > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          <MailWarning className="h-5 w-5 shrink-0" aria-hidden />
          <p className="min-w-0 flex-1">
            {plural(data.people.waitingToActivate, 'person')} {data.people.waitingToActivate === 1 ? 'hasn’t' : 'haven’t'} activated their account yet.
            You can resend their activation email from the Students, Teachers or Administrators page.
          </p>
          <Button asChild size="sm" variant="outline"><Link href="/school/students?status=pending">See who</Link></Button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <SchoolCreditsCard request={credits} now={now} />

        <DashboardSection
          title="Students by grade"
          icon={<GraduationCap className="h-5 w-5 text-primary" />}
          href="/school/students"
          linkLabel="Manage"
          loading={overview.loading}
          error={overview.error}
          retry={overview.refresh}
        >
          {data && data.studentsByGrade.length === 0 ? (
            <DashboardEmpty>No students yet. <Link className="underline" href="/school/students?add=1">Add your first student</Link>.</DashboardEmpty>
          ) : (
            <ul className="space-y-2">
              {data?.studentsByGrade.map((g) => (
                <li key={g.grade}>
                  <Link href={`/school/students?grade=${encodeURIComponent(g.grade)}`} className="group flex items-center gap-3 text-sm">
                    <span className="w-20 shrink-0 group-hover:underline">{g.grade === 'none' ? 'No grade' : gradeLevelLabel(g.grade)}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <span className="block h-full rounded-full bg-primary" style={{ width: `${(g.count / maxInGrade) * 100}%` }} />
                    </span>
                    <span className="w-10 text-right tabular-nums text-muted-foreground">{g.count}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </DashboardSection>

        <DashboardSection
          title="Teaching activity"
          icon={<BookOpen className="h-5 w-5 text-primary" />}
          loading={overview.loading}
          error={overview.error}
          retry={overview.refresh}
        >
          {data && (
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div><dt className="text-muted-foreground">Published lessons</dt><dd className="text-2xl font-medium">{data.lessons.published}</dd></div>
              <div><dt className="text-muted-foreground">Lesson drafts</dt><dd className="text-2xl font-medium">{data.lessons.drafts}</dd></div>
              <div><dt className="text-muted-foreground">Homework open now</dt><dd className="text-2xl font-medium">{data.homework.open}</dd></div>
              <div><dt className="text-muted-foreground">Homework set (30 days)</dt><dd className="text-2xl font-medium">{data.homework.publishedLast30Days}</dd></div>
            </dl>
          )}
        </DashboardSection>

        <DashboardSection
          title="Upcoming live classes"
          icon={<CalendarClock className="h-5 w-5 text-primary" />}
          loading={overview.loading}
          error={overview.error}
          retry={overview.refresh}
        >
          {data && data.liveClasses.next.length === 0 ? (
            <DashboardEmpty>No live classes are scheduled.</DashboardEmpty>
          ) : (
            <ul className="divide-y text-sm">
              {data?.liveClasses.next.map((c) => (
                <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                  <span className="min-w-0 break-words font-medium">{c.title}</span>
                  <span className="text-muted-foreground">
                    {formatWhen(c.startsAt, now)}{c.gradeLevel ? ` · ${gradeLevelLabel(c.gradeLevel)}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {data && data.liveClasses.upcomingThisWeek > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">{plural(data.liveClasses.upcomingThisWeek, 'class')} in the next 7 days.</p>
          )}
        </DashboardSection>

        <DashboardSection
          title="Recently added"
          icon={<Users className="h-5 w-5 text-primary" />}
          loading={overview.loading}
          error={overview.error}
          retry={overview.refresh}
        >
          {data && data.recentlyAdded.length === 0 ? (
            <DashboardEmpty>Nobody has been added yet.</DashboardEmpty>
          ) : (
            <ul className="divide-y text-sm">
              {data?.recentlyAdded.map((p) => (
                <li key={p.memberId} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                  <span className="min-w-0 break-words">{p.name}</span>
                  <span className="text-muted-foreground">{schoolRoleLabel(p.role)} · {formatWhen(p.joinedAt, now)}</span>
                </li>
              ))}
            </ul>
          )}
        </DashboardSection>
      </div>
    </div>
  );
}
