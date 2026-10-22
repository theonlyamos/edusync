'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DataState, useHomeworkData } from '@/components/homework/shared'
import { formatDate } from '@/lib/format-date'
import { formatGrade } from '@/lib/grade'
import type { HomeworkState } from '@/lib/teacher-students'
import type { TeacherStudentDetail } from '@/lib/teacher-students-server'

const STATE_LABEL: Record<HomeworkState, string> = {
  released: 'Marked',
  marking: 'Being marked',
  submitted: 'To mark',
  missed: 'Missed',
  open: 'Not handed in yet',
}

const WEAK_PERCENT = 70

export default function TeacherStudentPage() {
  const params = useParams<{ studentId: string }>()
  const { data, loading, error, refresh } = useHomeworkData<TeacherStudentDetail>(`/api/teachers/students/${params.studentId}`)
  const done = data?.homework.filter((h) => h.submittedAt).length ?? 0
  const scores = data?.homework.map((h) => h.score).filter((n): n is number => n !== null) ?? []
  const average = scores.length ? Math.round(scores.reduce((n, v) => n + v, 0) / scores.length) : null
  const weak = data?.objectives.filter((o) => o.percentage < WEAK_PERCENT) ?? []

  return (
    <DashboardLayout>
      <div className="max-w-5xl space-y-6">
        <Link href="/teachers/students" className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground xl:min-h-0">
          <ArrowLeft className="h-4 w-4" /> Students
        </Link>
        {!data ? (
          <DataState loading={loading} error={error} retry={refresh} />
        ) : (
          <>
            <div>
              <h1 className="break-words text-3xl font-bold">{data.student.name}</h1>
              <p className="mt-1 text-muted-foreground">
                {[data.student.grade ? formatGrade(data.student.grade) : null, data.student.email].filter(Boolean).join(' · ')}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: 'Homework handed in', value: data.homework.length ? `${done} of ${data.homework.length}` : '—' },
                { label: 'Average released score', value: average === null ? '—' : `${average}%` },
                { label: 'AI tutor this month', value: `${data.tutorMinutesThisMonth} min` },
                { label: 'Last active', value: data.student.lastActive ? formatDate(data.student.lastActive) : 'Over 90 days ago' },
              ].map((stat) => (
                <Card key={stat.label}>
                  <CardHeader className="pb-2">
                    <CardDescription>{stat.label}</CardDescription>
                    <CardTitle className="text-2xl tabular-nums">{stat.value}</CardTitle>
                  </CardHeader>
                </Card>
              ))}
            </div>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Homework</CardTitle>
                  <CardDescription>Homework you set for this student, newest first.</CardDescription>
                </CardHeader>
                <CardContent>
                  {data.homework.length === 0 ? (
                    <p className="text-sm text-muted-foreground">You haven&apos;t set this student any homework yet.</p>
                  ) : (
                    <ul className="divide-y">
                      {data.homework.map((h) => (
                        <li key={h.homeworkId} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                          <div className="min-w-0">
                            <Link href={`/teachers/homework/${h.homeworkId}`} className="break-words font-medium hover:underline">
                              {h.title}
                            </Link>
                            <p className="text-xs text-muted-foreground">Due {formatDate(h.dueAt)}</p>
                          </div>
                          <div className="flex shrink-0 flex-wrap items-center gap-2">
                            {h.late && <Badge variant="outline">Late</Badge>}
                            <Badge variant={h.state === 'missed' ? 'destructive' : h.state === 'released' ? 'secondary' : 'outline'}>
                              {STATE_LABEL[h.state]}
                            </Badge>
                            {h.score !== null && (
                              <span className={`w-12 text-right tabular-nums ${h.score < 50 ? 'font-medium text-destructive' : ''}`}>{h.score}%</span>
                            )}
                            {(h.state === 'submitted' || h.state === 'marking') && (
                              <Link
                                href={`/teachers/homework/${h.homeworkId}/mark?studentId=${data.student.id}`}
                                className="text-xs text-primary hover:underline"
                              >
                                Mark
                              </Link>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Objectives to revisit</CardTitle>
                  <CardDescription>Below {WEAK_PERCENT}% in marked homework.</CardDescription>
                </CardHeader>
                <CardContent>
                  {weak.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {data.objectives.length ? 'Nothing below 70% so far.' : 'No marked homework yet.'}
                    </p>
                  ) : (
                    <ul className="space-y-3 text-sm">
                      {weak.map((o) => (
                        <li key={`${o.objectiveId}-${o.homeworkTitle}`}>
                          <div className="flex justify-between gap-3">
                            <span className="min-w-0 break-words font-medium">{o.text}</span>
                            <span className="shrink-0 tabular-nums">{o.percentage}%</span>
                          </div>
                          <p className="text-xs text-muted-foreground">{o.homeworkTitle}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  )
}
