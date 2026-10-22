'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, Clock, Presentation, Users } from 'lucide-react'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DataState, useHomeworkData } from '@/components/homework/shared'
import { formatDateTimeRange, formatTime } from '@/lib/format-date'
import { formatGrade } from '@/lib/grade'
import type { LiveClassSummary } from '@/lib/live-class-summary'

function minutesBetween(start: string | null, end: string | null) {
  if (!start || !end) return null
  const minutes = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000)
  return minutes > 0 ? minutes : null
}

export default function LiveClassSummaryPage() {
  const params = useParams<{ eventId: string }>()
  const { data, loading, error, refresh } = useHomeworkData<LiveClassSummary>(`/api/live-classes/${params.eventId}/summary`)
  const ran = data?.session ? minutesBetween(data.session.startedAt, data.session.endedAt) : null

  return (
    <DashboardLayout>
      <div className="max-w-4xl space-y-6">
        <Link href="/teachers/live" className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground xl:min-h-0">
          <ArrowLeft className="h-4 w-4" /> Live classes
        </Link>
        {!data ? (
          <DataState loading={loading} error={error} retry={refresh} />
        ) : (
          <>
            <div>
              <h1 className="break-words text-3xl font-bold">{data.event.title}</h1>
              <p className="mt-1 text-muted-foreground">
                {[
                  formatDateTimeRange(data.event.scheduledStart, data.event.scheduledEnd),
                  data.event.gradeLevel ? formatGrade(data.event.gradeLevel) : null,
                  data.event.lessonTitle,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-2"><Users className="h-4 w-4" /> Students joined</CardDescription>
                  <CardTitle className="text-3xl tabular-nums">
                    {data.attendance.joined} <span className="text-base font-normal text-muted-foreground">of {data.attendance.invited}</span>
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-2"><Clock className="h-4 w-4" /> Live AI time</CardDescription>
                  <CardTitle className="text-3xl tabular-nums">
                    {data.session ? data.session.minutesCharged : 0}{' '}
                    <span className="text-base font-normal text-muted-foreground">
                      {data.session?.minutesCharged === 1 ? 'credit' : 'credits'}
                    </span>
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">1 credit per minute{ran ? ` · room open about ${ran} min` : ''}</p>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-2"><Presentation className="h-4 w-4" /> Visuals made</CardDescription>
                  <CardTitle className="text-3xl tabular-nums">{data.visuals.length}</CardTitle>
                </CardHeader>
              </Card>
            </div>

            {!data.session && (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                Nobody opened the live room for this class, so there is nothing else to show.
              </p>
            )}

            {data.session?.topic && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Topic the AI co-teacher followed</CardTitle>
                  <CardDescription className="break-words text-base text-foreground">{data.session.topic}</CardDescription>
                </CardHeader>
              </Card>
            )}

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Attendance</CardTitle>
                  <CardDescription>When each student first joined the room.</CardDescription>
                </CardHeader>
                <CardContent>
                  {data.students.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No students were enrolled.</p>
                  ) : (
                    <ul className="divide-y">
                      {data.students.map((s) => (
                        <li key={s.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                          <span className="min-w-0 break-words">{s.name}</span>
                          <span className={s.joinedAt ? 'shrink-0 tabular-nums' : 'shrink-0 text-muted-foreground'}>
                            {s.joinedAt ? `Joined ${formatTime(s.joinedAt)}` : 'Didn’t join'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Visuals the AI co-teacher made</CardTitle>
                  <CardDescription>In the order they appeared.</CardDescription>
                </CardHeader>
                <CardContent>
                  {data.visuals.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No visuals were made in this class.</p>
                  ) : (
                    <ol className="space-y-2 text-sm">
                      {data.visuals.map((v, i) => (
                        <li key={v.id} className="flex gap-3">
                          <span className="w-6 shrink-0 text-right tabular-nums text-muted-foreground">{i + 1}.</span>
                          <span className="min-w-0 flex-1 break-words">{v.description}</span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">{formatTime(v.createdAt)}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </CardContent>
              </Card>
            </div>
            <Button variant="outline" size="sm" onClick={refresh}>Refresh summary</Button>
          </>
        )}
      </div>
    </DashboardLayout>
  )
}
