'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useLiveClassJoinTick } from '@/hooks/useLiveClassJoinTick'
import { getClientLiveClassLobbyMinutes, liveClassJoinStatesByEventId } from '@/lib/live-class-window'
import { groupLiveClasses } from '@/lib/live-class-phase'
import { formatGrade } from '@/lib/grade'
import { AlertTriangle, ChevronDown, Loader2 } from 'lucide-react'

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
  enrolled?: boolean
}

function lessonTitleFromEmbed(lessons: LessonsEmbed | undefined): string | null {
  if (!lessons) return null
  if (Array.isArray(lessons)) return lessons[0]?.title ?? null
  return lessons.title ?? null
}

function formatWindow(ev: EventRow) {
  const start = new Date(ev.scheduled_start_at)
  const end = new Date(ev.scheduled_end_at)
  const sameDay = start.toDateString() === end.toDateString()
  const day = start.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
  const time = (d: Date) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return sameDay ? `${day}, ${time(start)} – ${time(end)}` : `${start.toLocaleString()} – ${end.toLocaleString()}`
}

export default function StudentLiveClassesPage() {
  const router = useRouter()
  const [items, setItems] = useState<EventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showPast, setShowPast] = useState(false)
  const [joiningId, setJoiningId] = useState<string | null>(null)
  const [joinError, setJoinError] = useState<{ id: string; message: string } | null>(null)
  const joinTick = useLiveClassJoinTick()
  const lobbyMinutes = getClientLiveClassLobbyMinutes()
  const joinById = useMemo(
    () => liveClassJoinStatesByEventId(items, lobbyMinutes, new Date()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, lobbyMinutes, joinTick]
  )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const groups = useMemo(() => groupLiveClasses(items, new Date()), [items, joinTick])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await axios.get<{ items: EventRow[] }>('/api/live-classes')
      setItems(data.items || [])
    } catch {
      setError('Your live classes could not be loaded. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const join = async (ev: EventRow) => {
    setJoinError(null)
    if (ev.enrolled !== false) {
      router.push(`/students/live/${ev.id}`)
      return
    }
    setJoiningId(ev.id)
    try {
      await axios.post(`/api/live-classes/${ev.id}/join`)
      router.push(`/students/live/${ev.id}`)
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.error : null
      setJoinError({ id: ev.id, message: message || 'Could not join this class. Try again.' })
      setJoiningId(null)
    }
  }

  const renderCard = (ev: EventRow, phase: 'now' | 'upcoming' | 'past') => {
    const lt = lessonTitleFromEmbed(ev.lessons)
    const row = joinById.get(ev.id)
    const joinAllowed = phase !== 'past' && (row?.joinAllowed ?? false)
    const joinHint = phase === 'past' ? '' : row?.joinHint ?? ''
    return (
      <li key={ev.id}>
        <Card className={phase === 'now' ? 'border-primary' : phase === 'past' ? 'opacity-80' : undefined}>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <CardTitle className="text-lg break-words">{ev.title}</CardTitle>
              {phase === 'now' ? <Badge>Happening now</Badge> : null}
              {ev.status === 'cancelled' ? <Badge variant="outline">Cancelled</Badge> : null}
            </div>
            <CardDescription>
              <span className="block">
                {[ev.grade_level ? formatGrade(ev.grade_level) : null, lt ? `Lesson: ${lt}` : null]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
              <span className="block mt-1">{formatWindow(ev)}</span>
            </CardDescription>
          </CardHeader>
          {phase !== 'past' ? (
            <CardContent className="flex flex-col gap-2">
              <div>
                <Button
                  size="sm"
                  className="min-h-11 xl:min-h-0"
                  disabled={!joinAllowed || joiningId === ev.id}
                  title={joinHint}
                  onClick={() => void join(ev)}
                >
                  {joiningId === ev.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Join live session
                </Button>
              </div>
              {joinError?.id === ev.id ? (
                <p role="alert" className="text-xs text-destructive">{joinError.message}</p>
              ) : joinHint ? (
                <p className="text-xs text-muted-foreground max-w-lg">{joinHint}</p>
              ) : null}
            </CardContent>
          ) : null}
        </Card>
      </li>
    )
  }

  const hasCurrent = groups.now.length + groups.upcoming.length > 0

  return (
    <DashboardLayout>
      <div className="p-3 sm:p-6 max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Live classes</h1>
          <p className="text-muted-foreground text-sm mt-1 max-w-xl">
            Live classes for your grade. Join opens a few minutes before the start time.
          </p>
        </div>

        {loading ? (
          <div role="status" className="flex flex-col items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span>Loading your classes…</span>
          </div>
        ) : error ? (
          <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-xl border border-dashed p-8 text-center">
            <AlertTriangle className="h-8 w-8 text-amber-500" />
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" onClick={() => void load()}>Try again</Button>
          </div>
        ) : (
          <>
            {!hasCurrent ? (
              <Card>
                <CardHeader>
                  <CardTitle>No upcoming live classes</CardTitle>
                  <CardDescription>
                    When your teacher schedules a class for your grade, it will show up here.
                  </CardDescription>
                </CardHeader>
              </Card>
            ) : null}

            {groups.now.length > 0 ? (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Happening now</h2>
                <ul className="space-y-3">{groups.now.map((ev) => renderCard(ev, 'now'))}</ul>
              </section>
            ) : null}

            {groups.upcoming.length > 0 ? (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Upcoming</h2>
                <ul className="space-y-3">{groups.upcoming.map((ev) => renderCard(ev, 'upcoming'))}</ul>
              </section>
            ) : null}

            {groups.past.length > 0 ? (
              <section className="space-y-3">
                <button
                  type="button"
                  className="flex min-h-11 items-center gap-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
                  aria-expanded={showPast}
                  onClick={() => setShowPast((v) => !v)}
                >
                  Past classes ({groups.past.length})
                  <ChevronDown className={`h-4 w-4 transition-transform ${showPast ? 'rotate-180' : ''}`} />
                </button>
                {showPast ? <ul className="space-y-3">{groups.past.map((ev) => renderCard(ev, 'past'))}</ul> : null}
              </section>
            ) : null}
          </>
        )}
      </div>
    </DashboardLayout>
  )
}
