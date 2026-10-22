'use client';

import { useMemo, useState } from 'react';
import { Download, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DashboardStats } from '@/components/dashboard/DashboardParts';
import { useHomeworkData } from '@/components/homework/shared';
import { ActivityChart } from '@/components/school-portal/ActivityChart';
import { NATIVE_SELECT_CLASS } from '@/components/school-portal/PersonFormDialog';
import { SchoolPageHeader } from '@/components/school-portal/SchoolPortalProvider';
import { gradeLevelLabel } from '@/lib/school-registration';
import {
  REPORT_RANGES,
  REPORT_RANGE_LABEL,
  USAGE_KINDS,
  USAGE_KIND_LABEL,
  reportPeopleCsv,
  reportRoleLabel,
  reportTeachersCsv,
  type ReportRange,
  type SchoolReport,
} from '@/lib/school-reports';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 50;
type RoleFilter = 'all' | 'student' | 'teacher' | 'staff';

const n = (value: number) => value.toLocaleString();
const many = (value: number, one: string, other: string) => `${n(value)} ${value === 1 ? one : other}`;

function csvHref(csv: string) {
  return `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
}

function lastActive(value: string | null) {
  if (!value) return 'Not in this period';
  return new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export default function SchoolReportsPage() {
  const [days, setDays] = useState<ReportRange>(30);
  const report = useHomeworkData<SchoolReport>(`/api/schools/current/reports?days=${days}`);
  const data = report.data;

  return (
    <div>
      <SchoolPageHeader
        title="Reports"
        description="How your school is using InsyteAI: credits, studying and teaching."
        actions={
          <>
            <select aria-label="Period" className={cn(NATIVE_SELECT_CLASS, 'w-auto')} value={days} onChange={(e) => setDays(Number(e.target.value) as ReportRange)}>
              {REPORT_RANGES.map((r) => <option key={r} value={r}>{REPORT_RANGE_LABEL[r]}</option>)}
            </select>
            {data && (
              <>
                <Button asChild variant="outline">
                  <a href={csvHref(reportPeopleCsv(data))} download={`school-usage-${days}-days.csv`}><Download className="mr-2 h-4 w-4" />Usage CSV</a>
                </Button>
                <Button asChild variant="outline">
                  <a href={csvHref(reportTeachersCsv(data))} download={`school-teaching-${days}-days.csv`}><Download className="mr-2 h-4 w-4" />Teaching CSV</a>
                </Button>
              </>
            )}
          </>
        }
      />

      {report.error ? (
        <div className="rounded-lg border p-6 text-sm">
          <p className="text-destructive">{report.error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={report.refresh}>Try again</Button>
        </div>
      ) : !data ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" aria-label="Loading" /></div>
      ) : (
        <ReportBody data={data} />
      )}
    </div>
  );
}

function ReportBody({ data }: { data: SchoolReport }) {
  const t = data.totals;
  const maxKind = Math.max(1, ...USAGE_KINDS.map((k) => t.creditsByKind[k]));

  return (
    <div className="space-y-6">
      <div className="[&>div]:mb-0">
        <DashboardStats
          items={[
            { label: 'Credits used', value: n(t.creditsUsed), detail: t.creditsPurchased ? `${n(t.creditsPurchased)} bought in this period` : '1 credit = 1 minute of live AI', href: '/school/billing' },
            { label: 'Students active', value: `${n(t.activeStudents)} of ${n(t.students)}`, detail: 'Opened a lesson, used the tutor or handed in homework' },
            { label: 'Homework handed in', value: n(t.homeworkSubmitted), detail: `${many(t.homeworkSet, 'assignment', 'assignments')} set` },
          ]}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <MiniStat label="AI tutor sessions" value={n(t.tutorSessions)} />
        <MiniStat label="Lessons opened by students" value={n(t.lessonsStudied)} />
        <MiniStat label="Live classes held" value={n(t.liveClassesHeld)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Students active each day</CardTitle>
            <CardDescription>Students who studied, used the tutor or handed in homework.</CardDescription>
          </CardHeader>
          <CardContent>
            <ActivityChart label="Active students" data={data.daily.map((d) => ({ date: d.date, value: d.activeStudents }))} unit={(v) => many(v, 'student', 'students')} />
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Credits used each day</CardTitle>
            <CardDescription>After refunds for sessions that failed.</CardDescription>
          </CardHeader>
          <CardContent>
            <ActivityChart label="Credits used" data={data.daily.map((d) => ({ date: d.date, value: d.creditsUsed }))} unit={(v) => many(v, 'credit', 'credits')} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">What credits were spent on</CardTitle>
        </CardHeader>
        <CardContent>
          {t.creditsUsed === 0 ? (
            <p className="text-sm text-muted-foreground">No credits were used in this period.</p>
          ) : (
            <ul className="space-y-3">
              {USAGE_KINDS.map((k) => (
                <li key={k} className="grid grid-cols-[8rem_minmax(0,1fr)_4rem] items-center gap-3 text-sm sm:grid-cols-[10rem_minmax(0,1fr)_5rem]">
                  <span>{USAGE_KIND_LABEL[k]}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-muted">
                    <span className="block h-full rounded-full bg-primary" style={{ width: `${(t.creditsByKind[k] / maxKind) * 100}%` }} />
                  </span>
                  <span className="text-right tabular-nums">{n(t.creditsByKind[k])}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <TeachingTable data={data} />
      <PeopleTable data={data} />
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-medium">{value}</p>
    </div>
  );
}

function TeachingTable({ data }: { data: SchoolReport }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Teaching</CardTitle>
        <CardDescription>What each teacher did in this period.</CardDescription>
      </CardHeader>
      <CardContent>
        {data.teachers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No teachers yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">Teacher</th>
                  <th className="px-3 py-2 text-right font-medium">Lessons created</th>
                  <th className="px-3 py-2 text-right font-medium">Lessons published</th>
                  <th className="px-3 py-2 text-right font-medium">Homework set</th>
                  <th className="px-3 py-2 text-right font-medium">Live classes</th>
                  <th className="py-2 pl-3 text-right font-medium">Credits used</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.teachers.map((t) => (
                  <tr key={t.userId} className={cn(!t.isActive && 'text-muted-foreground')}>
                    <td className="py-2 pr-3">{t.name}{!t.isActive && <span className="ml-2 text-xs">(deactivated)</span>}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{t.lessonsCreated}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{t.lessonsPublished}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{t.homeworkSet}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{t.liveClassesHeld}</td>
                    <td className="py-2 pl-3 text-right tabular-nums">{n(t.creditsUsed)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PeopleTable({ data }: { data: SchoolReport }) {
  const [role, setRole] = useState<RoleFilter>('student');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.people.filter((p) => {
      if (role === 'student' && p.role !== 'student') return false;
      if (role === 'teacher' && p.role !== 'teacher') return false;
      if (role === 'staff' && p.role !== 'admin' && p.role !== 'owner' && p.role !== 'former') return false;
      return !q || `${p.name} ${p.email}`.toLowerCase().includes(q);
    });
  }, [data.people, role, query]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Usage by person</CardTitle>
        <CardDescription>Sorted by credits used. Students who haven’t done anything in this period are at the bottom.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem]">
          <div className="relative">
            <Label htmlFor="usage-search" className="sr-only">Search people</Label>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input id="usage-search" className="pl-9" placeholder="Search by name or email" value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} />
          </div>
          <select aria-label="Who" className={NATIVE_SELECT_CLASS} value={role} onChange={(e) => { setRole(e.target.value as RoleFilter); setPage(0); }}>
            <option value="student">Students</option>
            <option value="teacher">Teachers</option>
            <option value="staff">Administrators and others</option>
            <option value="all">Everyone</option>
          </select>
        </div>

        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody matches.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">Name</th>
                  <th className="px-3 py-2 text-right font-medium">Credits</th>
                  <th className="px-3 py-2 text-right font-medium">Tutor sessions</th>
                  <th className="px-3 py-2 text-right font-medium">Lessons opened</th>
                  <th className="px-3 py-2 text-right font-medium">Homework in</th>
                  <th className="px-3 py-2 text-right font-medium">Visuals / images</th>
                  <th className="py-2 pl-3 font-medium">Last active</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {visible.map((p) => (
                  <tr key={p.userId} className={cn(!p.isActive && 'text-muted-foreground')}>
                    <td className="max-w-[16rem] py-2 pr-3">
                      <div className="break-words font-medium text-foreground">{p.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {p.role === 'student' && p.grade ? gradeLevelLabel(p.grade) : reportRoleLabel(p.role)}
                        {!p.isActive && p.role !== 'former' && ' · deactivated'}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums" title={USAGE_KINDS.filter((k) => p.credits[k]).map((k) => `${USAGE_KIND_LABEL[k]}: ${p.credits[k]}`).join(', ') || undefined}>
                      {n(p.credits.total)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.tutorSessions}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.lessonsStudied}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.homeworkSubmitted}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.visuals} / {p.images}</td>
                    <td className="whitespace-nowrap py-2 pl-3 text-muted-foreground">{lastActive(p.lastActiveAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Page {page + 1} of {pages}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage((p) => p - 1)} disabled={page === 0}>Previous</Button>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page + 1 >= pages}>Next</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
