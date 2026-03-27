'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import axios from 'axios'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useLiveClassJoinTick } from '@/hooks/useLiveClassJoinTick'
import { getClientLiveClassLobbyMinutes, liveClassJoinStatesByEventId } from '@/lib/live-class-window'
import { Loader2 } from 'lucide-react'

type LessonsEmbed = { title?: string } | { title?: string }[] | null

type EventRow = {
  id: string
  title: string
  scheduled_start_at: string
  scheduled_end_at: string
  status: string
  organizer_id?: string
  grade_level?: string | null
  lessons?: LessonsEmbed
}

function lessonTitleFromEmbed(lessons: LessonsEmbed | undefined): string | null {
  if (!lessons) return null
  if (Array.isArray(lessons)) return lessons[0]?.title ?? null
  return lessons.title ?? null
}

export default function StudentLiveClassesPage() {
  const [items, setItems] = useState<EventRow[]>([])
  const [loading, setLoading] = useState(true)
  const joinTick = useLiveClassJoinTick()
  const lobbyMinutes = getClientLiveClassLobbyMinutes()
  const joinById = useMemo(
    () => liveClassJoinStatesByEventId(items, lobbyMinutes, new Date()),
    [items, lobbyMinutes, joinTick]
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await axios.get<{ items: EventRow[] }>('/api/live-classes')
        if (!cancelled) setItems(data.items || [])
      } catch {
        if (!cancelled) setItems([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <DashboardLayout>
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Live classes</h1>
          <p className="text-muted-foreground text-sm mt-1 max-w-xl">
            You only see live classes for your grade. When it is time, use Join live session (opens a little before the
            scheduled start).
          </p>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span>Loading your classes…</span>
          </div>
        ) : items.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No live classes yet</CardTitle>
              <CardDescription>
                When your teacher schedules a class for your grade, it will show up here. You can join from this list
                during the scheduled window.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <ul className="space-y-3">
            {items.map((ev) => {
              const lt = lessonTitleFromEmbed(ev.lessons)
              const statusLabel = ev.status ? ev.status.charAt(0).toUpperCase() + ev.status.slice(1) : ''
              const row = joinById.get(ev.id)
              const joinAllowed = row?.joinAllowed ?? false
              const joinHint = row?.joinHint ?? ''
              return (
              <li key={ev.id}>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">{ev.title}</CardTitle>
                    <CardDescription>
                      {ev.grade_level ? <span className="block">Grade: {ev.grade_level}</span> : null}
                      {lt ? <span className="block">Lesson: {lt}</span> : null}
                      <span className="block mt-1">
                        {new Date(ev.scheduled_start_at).toLocaleString()} –{' '}
                        {new Date(ev.scheduled_end_at).toLocaleString()}
                        {statusLabel ? ` · ${statusLabel}` : null}
                      </span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2">
                    <div>
                      {joinAllowed ? (
                        <Button asChild size="sm">
                          <Link href={`/students/live/${ev.id}`}>Join live session</Link>
                        </Button>
                      ) : (
                        <Button size="sm" disabled title={joinHint}>
                          Join live session
                        </Button>
                      )}
                    </div>
                    {joinHint ? (
                      <p className="text-xs text-muted-foreground max-w-lg">{joinHint}</p>
                    ) : null}
                  </CardContent>
                </Card>
              </li>
              )
            })}
          </ul>
        )}
      </div>
    </DashboardLayout>
  )
}
