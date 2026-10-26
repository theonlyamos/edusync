'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useHomeworkData } from '@/components/homework/shared';
import { ActivityChart } from '@/components/school-portal/ActivityChart';
import { AdminPageHeader, Empty, LoadState, StatTile, formatDateTime, n, plural } from '@/components/admin/AdminParts';
import type { UsageSummary } from '@/lib/platform-admin';
import { cn } from '@/lib/utils';

const SPANS = [7, 30, 90] as const;

const JOB_LABEL: Record<string, string> = {
  generate_interactive: 'Interactive activity',
  generate_image: 'Image',
  generate_structured_quiz: 'Quiz',
  generate_visual_quiz: 'Visual quiz',
  extract_media: 'Reading an upload',
  embed_media: 'Indexing an upload',
};

export default function AdminUsagePage() {
  const [days, setDays] = useState<(typeof SPANS)[number]>(30);
  const usage = useHomeworkData<UsageSummary>(`/api/admin/usage?days=${days}`);
  const data = usage.data;
  const jobsTotal = data ? data.jobs.succeeded + data.jobs.failed : 0;

  return (
    <div>
      <AdminPageHeader
        title="AI usage"
        description="What schools and people use the AI for, and where it fails."
        actions={
          <div role="group" aria-label="Period" className="inline-flex rounded-md border p-0.5">
            {SPANS.map((span) => (
              <button
                key={span}
                type="button"
                aria-pressed={days === span}
                onClick={() => setDays(span)}
                className={cn('rounded px-3 py-1.5 text-sm', days === span ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
              >
                {span} days
              </button>
            ))}
          </div>
        }
      />
      <LoadState loading={usage.loading && !data} error={usage.error} retry={usage.refresh}>
        {data && (
          <div className={cn('space-y-6', usage.loading && 'opacity-60')}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatTile label="AI tutor minutes" value={n(data.totals.voice)} detail={`${plural(data.totals.sessions, 'session')} · ${n(data.totals.embedSessions)} embedded`} />
              <StatTile label="Live class minutes" value={n(data.totals.liveClass)} />
              <StatTile label="Visuals made" value={n(data.totals.visuals)} />
              <StatTile label="Images made" value={n(data.totals.images)} />
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Card className="min-w-0">
                <CardHeader className="pb-2"><CardTitle className="text-lg">AI tutor minutes</CardTitle><CardDescription>Each day.</CardDescription></CardHeader>
                <CardContent><ActivityChart data={data.days.map((d) => ({ date: d.date, value: d.voice }))} label="AI tutor minutes" unit={(v) => `${n(v)} min`} /></CardContent>
              </Card>
              <Card className="min-w-0">
                <CardHeader className="pb-2"><CardTitle className="text-lg">Visuals and images</CardTitle><CardDescription>Each day.</CardDescription></CardHeader>
                <CardContent><ActivityChart data={data.days.map((d) => ({ date: d.date, value: d.visuals + d.images }))} label="Visuals and images" unit={(v) => n(v)} /></CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-lg">Top schools</CardTitle><CardDescription>The schools using the most AI in this period.</CardDescription></CardHeader>
              <CardContent className="p-0">
                {data.topSchools.length === 0 ? <Empty>No school used the AI in this period.</Empty> : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[36rem] text-sm">
                      <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <tr className="border-b">
                          <th className="px-4 py-3 font-medium">School</th>
                          <th className="px-3 py-3 text-right font-medium">Tutor min</th>
                          <th className="px-3 py-3 text-right font-medium">Live class min</th>
                          <th className="px-3 py-3 text-right font-medium">Visuals</th>
                          <th className="px-4 py-3 text-right font-medium">Images</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {data.topSchools.map((s) => (
                          <tr key={s.id}>
                            <td className="px-4 py-2.5"><Link href={`/admin/schools/${s.id}`} className="font-medium hover:underline">{s.name}</Link></td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{n(s.voice)}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{n(s.liveClass)}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{n(s.visuals)}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums">{n(s.images)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Content generation</CardTitle>
                <CardDescription>
                  {n(data.jobs.succeeded)} finished · {n(data.jobs.failed)} failed{jobsTotal ? ` (${Math.round((data.jobs.failed / jobsTotal) * 100)}%)` : ''} · {n(data.jobs.pending)} still running
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {data.jobs.failures.length === 0 ? <Empty>No failed jobs in this period.</Empty> : (
                  <ul className="divide-y">
                    {data.jobs.failures.map((job) => (
                      <li key={job.id} className="space-y-1 px-4 py-3 text-sm">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="font-medium">
                            {JOB_LABEL[job.type] ?? job.type.replace(/_/g, ' ')}
                            {job.schoolId && <> · <Link href={`/admin/schools/${job.schoolId}`} className="hover:underline">{job.schoolName ?? 'Unknown school'}</Link></>}
                          </span>
                          <time dateTime={job.at} className="text-xs text-muted-foreground">{formatDateTime(job.at)}</time>
                        </div>
                        <p className="break-words font-mono text-xs text-destructive">{job.error || 'No error message'}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </LoadState>
    </div>
  );
}
