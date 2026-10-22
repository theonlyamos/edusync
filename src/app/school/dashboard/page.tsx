'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import axios from 'axios';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  Circle,
  GraduationCap,
  Minus,
  UserPlus,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DashboardEmpty, DashboardSection } from '@/components/dashboard/DashboardParts';
import { useHomeworkData } from '@/components/homework/shared';
import { ActivityChart } from '@/components/school-portal/ActivityChart';
import { SchoolPageHeader, useSchoolPortal } from '@/components/school-portal/SchoolPortalProvider';
import { formatWhen } from '@/lib/dashboard';
import { gradeLevelLabel, type SchoolSetupStep } from '@/lib/school-registration';
import { schoolRoleLabel } from '@/lib/school-people';
import { USAGE_KINDS, USAGE_KIND_LABEL, percentChange, type SchoolReport } from '@/lib/school-reports';
import type { CreditSummary } from '@/lib/school-billing.server';
import type { GradeSummary } from '@/lib/school-grades.server';
import type { SchoolOverview } from '@/lib/school-overview.server';
import { cn } from '@/lib/utils';

function plural(n: number, word: string) {
  const many = word.endsWith('s') ? `${word}es` : word === 'person' ? 'people' : `${word}s`;
  return `${n.toLocaleString()} ${n === 1 ? word : many}`;
}

const SETUP_LINKS: Record<string, { href: string; label: string }> = {
  details: { href: '/school/settings', label: 'Add details' },
  grades: { href: '/school/settings', label: 'Choose grades' },
  people: { href: '/school/students', label: 'Add people' },
  credits: { href: '/school/billing', label: 'Buy credits' },
};

export default function SchoolDashboardPage() {
  const { school, setup, reload } = useSchoolPortal();
  const overview = useHomeworkData<SchoolOverview>('/api/schools/current/overview');
  const report = useHomeworkData<SchoolReport>('/api/schools/current/reports?days=30');
  const credits = useHomeworkData<CreditSummary>('/api/credits/summary');
  const grades = useHomeworkData<{ grades: GradeSummary[] }>('/api/schools/current/grades');
  const now = useMemo(() => new Date(), [overview.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const o = overview.data;
  const r = report.data;
  const balance = credits.data?.school?.balance ?? null;
  const today = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const maxInGrade = Math.max(1, ...(o?.studentsByGrade.map((g) => g.count) ?? [1]));

  return (
    <div className="space-y-6">
      <SchoolPageHeader
        title={school.name}
        description={today}
        actions={
          <>
            <Button asChild variant="outline"><Link href="/school/teachers?add=1"><UserPlus className="mr-2 h-4 w-4" />Add teacher</Link></Button>
            <Button asChild><Link href="/school/students?add=1"><UserPlus className="mr-2 h-4 w-4" />Add student</Link></Button>
          </>
        }
      />

      {!school.setupDismissedAt && setup.steps.some((s) => !s.done) && (
        <SetupProgress steps={setup.steps} onHide={async () => { await axios.patch('/api/schools/current', { setupDismissed: true }); await reload(); }} />
      )}

      {/* Headline numbers for this week. */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi
          label="Students active this week"
          value={r ? r.weeks.thisWeek.activeStudents.toLocaleString() : '…'}
          detail={r && o ? `of ${o.people.students.toLocaleString()} students` : undefined}
          change={r ? percentChange(r.weeks.thisWeek.activeStudents, r.weeks.lastWeek.activeStudents) : null}
          href="/school/reports"
        />
        <Kpi
          label="Homework handed in this week"
          value={r ? r.weeks.thisWeek.submissions.toLocaleString() : '…'}
          detail={o ? `${plural(o.homework.open, 'assignment')} open now` : undefined}
          change={r ? percentChange(r.weeks.thisWeek.submissions, r.weeks.lastWeek.submissions) : null}
          href="/school/reports"
        />
        <Kpi
          label="Credits used this week"
          value={r ? r.weeks.thisWeek.creditsUsed.toLocaleString() : '…'}
          detail="1 credit = 1 minute of live AI"
          change={r ? percentChange(r.weeks.thisWeek.creditsUsed, r.weeks.lastWeek.creditsUsed) : null}
          href="/school/reports"
        />
        <Kpi
          label="Credits left"
          value={balance ? balance.total.toLocaleString() : credits.error ? '—' : '…'}
          detail={balance ? (balance.total <= 0 ? 'Out of credits' : balance.low ? 'Running low' : balance.trialActive ? `Includes ${balance.trial.toLocaleString()} trial credits` : 'Ready to use') : undefined}
          warn={Boolean(balance?.low)}
          href="/school/billing"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          title="Students active each day"
          description="Last 30 days. Studying a lesson, using the AI tutor or handing in homework."
          loading={report.loading && !r}
          error={report.error}
          retry={report.refresh}
        >
          {r && <ActivityChart label="Active students" data={r.daily.map((d) => ({ date: d.date, value: d.activeStudents }))} unit={(v) => plural(v, 'student')} />}
        </ChartCard>
        <ChartCard
          title="Credits used each day"
          description={r ? `Last 30 days: ${plural(r.totals.creditsUsed, 'credit')} in total.` : 'Last 30 days.'}
          loading={report.loading && !r}
          error={report.error}
          retry={report.refresh}
        >
          {r && (
            <>
              <ActivityChart label="Credits used" data={r.daily.map((d) => ({ date: d.date, value: d.creditsUsed }))} unit={(v) => plural(v, 'credit')} />
              {r.totals.creditsUsed > 0 && (
                <p className="mt-3 text-xs text-muted-foreground">
                  {USAGE_KINDS.filter((k) => r.totals.creditsByKind[k] > 0).map((k) => `${USAGE_KIND_LABEL[k]} ${r.totals.creditsByKind[k].toLocaleString()}`).join(' · ')}
                </p>
              )}
            </>
          )}
        </ChartCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <NeedsAttention overview={o} report={r} credits={credits.data} grades={grades.data?.grades ?? null} loading={!o || !r} />

        <DashboardSection
          title="Upcoming live classes"
          icon={<CalendarClock className="h-5 w-5 text-primary" />}
          href="/school/timetables"
          linkLabel="Timetables"
          loading={overview.loading}
          error={overview.error}
          retry={overview.refresh}
        >
          {o && o.liveClasses.next.length === 0 ? (
            <DashboardEmpty>No live classes are scheduled.</DashboardEmpty>
          ) : (
            <ul className="divide-y text-sm">
              {o?.liveClasses.next.map((c) => (
                <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                  <span className="min-w-0 break-words font-medium">{c.title}</span>
                  <span className="text-muted-foreground">
                    {formatWhen(c.startsAt, now)}{c.gradeLevel ? ` · ${gradeLevelLabel(c.gradeLevel)}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {o && o.liveClasses.upcomingThisWeek > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">{plural(o.liveClasses.upcomingThisWeek, 'class')} in the next 7 days.</p>
          )}
        </DashboardSection>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <DashboardSection
          title="People"
          icon={<Users className="h-5 w-5 text-primary" />}
          loading={overview.loading}
          error={overview.error}
          retry={overview.refresh}
        >
          {o && (
            <ul className="divide-y text-sm">
              <PeopleRow href="/school/students" label="Students" value={o.people.students} />
              <PeopleRow href="/school/teachers" label="Teachers" value={o.people.teachers} />
              <PeopleRow href="/school/administrators" label="Administrators" value={o.people.administrators} />
              {o.people.waitingToActivate > 0 && <PeopleRow href="/school/students?status=pending" label="Waiting to activate" value={o.people.waitingToActivate} muted />}
              {o.people.deactivated > 0 && <PeopleRow href="/school/students?status=deactivated" label="Deactivated" value={o.people.deactivated} muted />}
            </ul>
          )}
        </DashboardSection>

        <DashboardSection
          title="Students by grade"
          icon={<GraduationCap className="h-5 w-5 text-primary" />}
          href="/school/grades"
          linkLabel="Grades"
          loading={overview.loading}
          error={overview.error}
          retry={overview.refresh}
        >
          {o && o.studentsByGrade.length === 0 ? (
            <DashboardEmpty>No students yet. <Link className="underline" href="/school/students?add=1">Add your first student</Link>.</DashboardEmpty>
          ) : (
            <ul className="space-y-2">
              {o?.studentsByGrade.map((g) => (
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
          title="Teaching, last 30 days"
          icon={<BookOpen className="h-5 w-5 text-primary" />}
          href="/school/lessons"
          linkLabel="Lessons"
          loading={report.loading && !r}
          error={report.error}
          retry={report.refresh}
        >
          {r && o && (
            <div className="space-y-4 text-sm">
              <dl className="grid grid-cols-3 gap-2">
                <div><dt className="text-xs text-muted-foreground">Published lessons</dt><dd className="text-xl font-medium">{o.lessons.published}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Homework set</dt><dd className="text-xl font-medium">{r.totals.homeworkSet}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Live classes</dt><dd className="text-xl font-medium">{r.totals.liveClassesHeld}</dd></div>
              </dl>
              {r.teachers.length === 0 ? (
                <DashboardEmpty>No teachers yet.</DashboardEmpty>
              ) : (
                <ul className="divide-y">
                  {r.teachers.filter((t) => t.isActive).slice(0, 5).map((t) => {
                    const total = t.lessonsPublished + t.homeworkSet + t.liveClassesHeld;
                    return (
                      <li key={t.userId} className="flex items-baseline justify-between gap-2 py-2">
                        <span className="min-w-0 break-words">{t.name}</span>
                        <span className={cn('shrink-0 text-xs', total === 0 ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground')}>
                          {total === 0 ? 'Nothing yet' : [
                            t.lessonsPublished && plural(t.lessonsPublished, 'lesson'),
                            t.homeworkSet && `${t.homeworkSet} homework`,
                            t.liveClassesHeld && plural(t.liveClassesHeld, 'class'),
                          ].filter(Boolean).join(' · ')}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </DashboardSection>
      </div>

      <DashboardSection
        title="Recently added"
        icon={<UserPlus className="h-5 w-5 text-primary" />}
        loading={overview.loading}
        error={overview.error}
        retry={overview.refresh}
      >
        {o && o.recentlyAdded.length === 0 ? (
          <DashboardEmpty>Nobody has been added yet.</DashboardEmpty>
        ) : (
          <ul className="grid gap-x-6 text-sm sm:grid-cols-2">
            {o?.recentlyAdded.map((p) => (
              <li key={p.memberId} className="flex flex-wrap items-baseline justify-between gap-2 border-b py-2">
                <span className="min-w-0 break-words">{p.name}</span>
                <span className="text-muted-foreground">{schoolRoleLabel(p.role)} · {formatWhen(p.joinedAt, now)}</span>
              </li>
            ))}
          </ul>
        )}
      </DashboardSection>
    </div>
  );
}

function Kpi({ label, value, detail, change, href, warn }: {
  label: string;
  value: string;
  detail?: string;
  change?: number | null;
  href: string;
  warn?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'min-w-0 rounded-lg border bg-card p-4 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        warn && 'border-amber-400 dark:border-amber-700',
      )}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="my-1 flex flex-wrap items-baseline gap-x-3">
        <span className="text-2xl font-medium tabular-nums sm:text-3xl">{value}</span>
        {change !== undefined && change !== null && <Trend change={change} />}
      </div>
      {detail && (
        <p className={cn('flex items-center gap-1 text-xs', warn ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground')}>
          {warn && <AlertTriangle className="h-3.5 w-3.5" aria-hidden />}
          {detail}
        </p>
      )}
    </Link>
  );
}

function Trend({ change }: { change: number }) {
  const Icon = change > 0 ? ArrowUpRight : change < 0 ? ArrowDownRight : Minus;
  return (
    <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {change === 0 ? 'Same as last week' : `${Math.abs(change)}% ${change > 0 ? 'up' : 'down'} on last week`}
    </span>
  );
}

function ChartCard({ title, description, loading, error, retry, children }: {
  title: string;
  description: string;
  loading: boolean;
  error?: string;
  retry: () => void;
  children: ReactNode;
}) {
  return (
    <Card className="min-w-0">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="text-sm">
            <p className="text-destructive">{error}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={retry}>Try again</Button>
          </div>
        ) : loading ? (
          <div className="h-48 animate-pulse rounded-md bg-muted/60" role="status" aria-label="Loading" />
        ) : children}
      </CardContent>
    </Card>
  );
}

function PeopleRow({ href, label, value, muted }: { href: string; label: string; value: number; muted?: boolean }) {
  return (
    <li>
      <Link href={href} className="flex items-center justify-between gap-2 py-2 hover:underline">
        <span className={cn(muted && 'text-muted-foreground')}>{label}</span>
        <span className="tabular-nums">{value.toLocaleString()}</span>
      </Link>
    </li>
  );
}

function SetupProgress({ steps, onHide }: { steps: SchoolSetupStep[]; onHide: () => Promise<void> }) {
  const [hiding, setHiding] = useState(false);
  const done = steps.filter((s) => s.done).length;
  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-medium">Finish setting up your school</p>
            <p className="text-sm text-muted-foreground">{done} of {steps.length} steps done</p>
          </div>
          <Button variant="ghost" size="sm" disabled={hiding} onClick={async () => { setHiding(true); try { await onHide(); } finally { setHiding(false); } }}>
            Hide
          </Button>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={done} aria-label="Setup progress">
          <div className="h-full rounded-full bg-primary" style={{ width: `${(done / steps.length) * 100}%` }} />
        </div>
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          {steps.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
              <span className={cn('flex items-center gap-2', s.done && 'text-muted-foreground line-through')}>
                {s.done ? <CheckCircle2 className="h-4 w-4 text-primary" aria-label="Done" /> : <Circle className="h-4 w-4 text-muted-foreground" aria-label="To do" />}
                {s.title}
              </span>
              {!s.done && SETUP_LINKS[s.id] && (
                <Link href={SETUP_LINKS[s.id].href} className="inline-flex shrink-0 items-center gap-1 text-primary hover:underline">
                  {SETUP_LINKS[s.id].label}<ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

type Attention = { key: string; text: string; href: string; action: string };

function NeedsAttention({ overview, report, credits, grades, loading }: {
  overview: SchoolOverview | null;
  report: SchoolReport | null;
  credits: CreditSummary | null;
  grades: GradeSummary[] | null;
  loading: boolean;
}) {
  const items: Attention[] = [];
  const balance = credits?.school?.balance;
  if (balance && balance.total <= 0) {
    items.push({ key: 'credits', text: 'The school is out of credits. AI tutoring, live classes and extra visuals are paused.', href: '/school/billing', action: 'Buy credits' });
  } else if (balance?.low) {
    items.push({ key: 'credits', text: `Only ${plural(balance.total, 'credit')} left.`, href: '/school/billing', action: 'Buy credits' });
  }
  if (overview && overview.people.waitingToActivate > 0) {
    const n = overview.people.waitingToActivate;
    items.push({ key: 'activate', text: `${plural(n, 'person')} ${n === 1 ? 'hasn’t' : 'haven’t'} activated their account.`, href: '/school/students?status=pending', action: 'Resend emails' });
  }
  const noGrade = overview?.studentsByGrade.find((g) => g.grade === 'none')?.count ?? 0;
  if (noGrade > 0) items.push({ key: 'no-grade', text: `${plural(noGrade, 'student')} ${noGrade === 1 ? 'has' : 'have'} no grade.`, href: '/school/students?grade=none', action: 'Set grades' });
  const outsideList = grades?.filter((g) => !g.inSchoolList && g.students > 0) ?? [];
  if (outsideList.length > 0) {
    items.push({ key: 'old-grades', text: `Students are still in grades you no longer teach (${outsideList.map((g) => gradeLevelLabel(g.grade)).join(', ')}).`, href: '/school/grades', action: 'Review' });
  }
  const untaught = grades?.filter((g) => g.inSchoolList && g.students > 0 && g.teachers.length === 0) ?? [];
  if (untaught.length > 0) {
    items.push({ key: 'untaught', text: `${untaught.map((g) => gradeLevelLabel(g.grade)).join(', ')} ${untaught.length === 1 ? 'has' : 'have'} students but no teacher.`, href: '/school/teachers', action: 'Assign' });
  }
  if (report && report.totals.students > 0) {
    const idle = report.totals.students - report.totals.activeStudents;
    if (idle > 0) items.push({ key: 'idle-students', text: `${plural(idle, 'student')} haven’t studied in the last 30 days.`, href: '/school/reports', action: 'See who' });
    const idleTeachers = report.teachers.filter((t) => t.isActive && t.lessonsCreated + t.lessonsPublished + t.homeworkSet + t.liveClassesHeld === 0).length;
    if (idleTeachers > 0) items.push({ key: 'idle-teachers', text: `${plural(idleTeachers, 'teacher')} haven’t taught on InsyteAI in the last 30 days.`, href: '/school/reports', action: 'See who' });
  }
  if (overview && overview.lessons.drafts > 0) {
    items.push({ key: 'drafts', text: `${plural(overview.lessons.drafts, 'lesson')} still in draft, so students can’t see them.`, href: '/school/lessons', action: 'View' });
  }

  return (
    <DashboardSection title="Needs attention" icon={<AlertTriangle className="h-5 w-5 text-primary" />} loading={loading}>
      {items.length === 0 ? (
        <p className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden />Nothing needs your attention right now.
        </p>
      ) : (
        <ul className="divide-y text-sm">
          {items.map((item) => (
            <li key={item.key} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="min-w-0 flex-1">{item.text}</span>
              <Button asChild variant="outline" size="sm"><Link href={item.href}>{item.action}</Link></Button>
            </li>
          ))}
        </ul>
      )}
    </DashboardSection>
  );
}
