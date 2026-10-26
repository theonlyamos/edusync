'use client';

import Link from 'next/link';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useHomeworkData } from '@/components/homework/shared';
import { ActivityChart } from '@/components/school-portal/ActivityChart';
import { AdminPageHeader, Empty, LoadState, StatTile, n, plural } from '@/components/admin/AdminParts';
import { formatDollars, type PlatformOverview } from '@/lib/platform-admin';

export default function AdminOverviewPage() {
  const overview = useHomeworkData<PlatformOverview>('/api/admin/overview');
  const data = overview.data;
  return (
    <div>
      <AdminPageHeader title="Overview" description="How InsyteAI is doing across every school and account." />
      <LoadState loading={overview.loading && !data} error={overview.error} retry={overview.refresh}>
        {data && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatTile
                label="Schools"
                value={n(data.schools.total)}
                href="/admin/schools"
                detail={`${n(data.schools.activeLast7Days)} active this week · ${n(data.schools.newThisMonth)} new this month${data.schools.suspended ? ` · ${data.schools.suspended} suspended` : ''}`}
              />
              <StatTile
                label="Accounts"
                value={n(data.users.total)}
                href="/admin/users"
                detail={`${n(data.users.activeLast7Days)} signed in this week · ${n(data.users.newThisMonth)} new this month`}
              />
              <StatTile
                label="Revenue this month"
                value={formatDollars(data.revenue.thisMonth)}
                href="/admin/billing"
                now={data.revenue.thisMonth}
                before={data.revenue.lastMonth}
                detail={`${n(data.revenue.creditsSoldThisMonth)} credits sold`}
              />
              <StatTile
                label="AI tutor minutes this month"
                value={n(data.voiceMinutes.thisMonth)}
                href="/admin/usage"
                now={data.voiceMinutes.thisMonth}
                before={data.voiceMinutes.lastMonth}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatTile label="Live class minutes this month" value={n(data.liveClassMinutes.thisMonth)} now={data.liveClassMinutes.thisMonth} before={data.liveClassMinutes.lastMonth} href="/admin/usage" />
              <StatTile label="Visuals made this month" value={n(data.visuals.thisMonth)} now={data.visuals.thisMonth} before={data.visuals.lastMonth} href="/admin/usage" />
              <StatTile label="Images made this month" value={n(data.images.thisMonth)} now={data.images.thisMonth} before={data.images.lastMonth} href="/admin/usage" />
              <StatTile
                label="People"
                value={plural(data.users.students, 'student')}
                detail={`${plural(data.users.teachers, 'teacher')} · ${plural(data.users.learners, 'learner')} · ${plural(data.users.admins, 'admin')}`}
                href="/admin/users"
              />
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg"><AlertTriangle className="h-5 w-5 text-amber-500" aria-hidden />Needs attention</CardTitle>
              </CardHeader>
              <CardContent>
                {data.attention.length === 0 ? (
                  <Empty>Nothing needs you right now.</Empty>
                ) : (
                  <ul className="divide-y">
                    {data.attention.map((item, i) => (
                      <li key={`${item.kind}-${i}`}>
                        <Link href={item.href} className="flex items-center gap-3 py-3 hover:text-foreground">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium break-words">{item.title}</p>
                            <p className="text-sm text-muted-foreground break-words">{item.detail}</p>
                          </div>
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <Card className="min-w-0">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">Sign-ups</CardTitle>
                  <CardDescription>New accounts each day, last 30 days.</CardDescription>
                </CardHeader>
                <CardContent>
                  <ActivityChart data={data.daily.map((d) => ({ date: d.date, value: d.signups }))} label="Sign-ups" unit={(v) => `${n(v)} ${v === 1 ? 'sign-up' : 'sign-ups'}`} />
                </CardContent>
              </Card>
              <Card className="min-w-0">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">AI tutor minutes</CardTitle>
                  <CardDescription>Voice minutes each day, last 30 days.</CardDescription>
                </CardHeader>
                <CardContent>
                  <ActivityChart data={data.daily.map((d) => ({ date: d.date, value: d.voiceMinutes }))} label="AI tutor minutes" unit={(v) => `${n(v)} min`} />
                </CardContent>
              </Card>
              <Card className="min-w-0">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">Revenue</CardTitle>
                  <CardDescription>Credit purchases each day, last 30 days.</CardDescription>
                </CardHeader>
                <CardContent>
                  <ActivityChart data={data.daily.map((d) => ({ date: d.date, value: d.revenue }))} label="Revenue" unit={(v) => formatDollars(v)} />
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </LoadState>
    </div>
  );
}
