'use client'

import { useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { Room, RoomEvent, Track as LkTrack } from 'livekit-client'
import axios from 'axios'
import dynamic from 'next/dynamic'
import { SupabaseBrowserClientContext } from '@/components/providers/SupabaseAuthProvider'
import { useLiveClassJoinTick } from '@/hooks/useLiveClassJoinTick'
import {
  getClientLiveClassLobbyMinutes,
  isWithinLiveClassJoinWindow,
  liveClassJoinWindowBlockedMessage,
} from '@/lib/live-class-window'
import { vizReducer, initialVizState, Visualization } from '@/reducers/visualizationReducer'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { AlertTriangle, Loader2, Mic, MicOff, Radio } from 'lucide-react'

const ReactRenderer = dynamic(() => import('@/components/lessons/ReactRenderer').then((m) => m.ReactRenderer), {
  ssr: false,
})
const LiveSketch = dynamic(() => import('@/components/lessons/LiveSketch').then((m) => m.LiveSketch), {
  ssr: false,
})

type Phase = 'lobby' | 'connecting' | 'live' | 'error'

export function LiveClassInteractiveTutor({ liveClassEventId }: { liveClassEventId: string }) {
  const supabase = useContext(SupabaseBrowserClientContext)
  const [vizState, vizDispatch] = useReducer(vizReducer, initialVizState)
  const { code, library } = vizState

  const clientLobbyMinutes = getClientLiveClassLobbyMinutes()
  const joinTick = useLiveClassJoinTick()
  const [schedule, setSchedule] = useState<{ start: string; end: string } | null>(null)
  const [scheduleLoad, setScheduleLoad] = useState<'idle' | 'loading' | 'error'>('loading')

  const [phase, setPhase] = useState<Phase>('lobby')
  const [err, setErr] = useState('')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [show, setShow] = useState<'render' | 'code'>('render')
  const [micOn, setMicOn] = useState(true)
  const roomRef = useRef<Room | null>(null)
  const audioMountRef = useRef<HTMLDivElement>(null)
  const seenVizIds = useRef<Set<string>>(new Set())
  const vizWrapRef = useRef<HTMLDivElement>(null)

  const disconnect = useCallback(async () => {
    audioMountRef.current?.replaceChildren()
    const r = roomRef.current
    roomRef.current = null
    if (r) await r.disconnect()
    setSessionId(null)
    setPhase('lobby')
    seenVizIds.current.clear()
    vizDispatch({ type: 'RESET' })
  }, [])

  useEffect(() => {
    return () => {
      void roomRef.current?.disconnect()
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setScheduleLoad('loading')
    setSchedule(null)
    ;(async () => {
      try {
        const { data } = await axios.get<{
          event: { scheduled_start_at: string; scheduled_end_at: string }
        }>(`/api/live-classes/${liveClassEventId}`)
        if (cancelled) return
        const ev = data.event
        if (ev?.scheduled_start_at && ev?.scheduled_end_at) {
          setSchedule({ start: ev.scheduled_start_at, end: ev.scheduled_end_at })
          setScheduleLoad('idle')
        } else {
          setScheduleLoad('error')
        }
      } catch {
        if (!cancelled) setScheduleLoad('error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [liveClassEventId])

  const joinWindow = useMemo(() => {
    if (!schedule) return { ok: false as const, reason: 'loading' as const }
    return isWithinLiveClassJoinWindow(schedule.start, schedule.end, {
      lobbyMinutes: clientLobbyMinutes,
      now: new Date(),
    })
  }, [schedule, clientLobbyMinutes, joinTick])

  const joinAllowed = scheduleLoad === 'idle' && schedule != null && joinWindow.ok

  const joinBlockedHint = useMemo(() => {
    if (scheduleLoad === 'loading') return 'Checking scheduled time…'
    if (scheduleLoad === 'error' || !schedule) {
      return 'We could not load this class schedule. Refresh the page or go back and try again.'
    }
    return liveClassJoinWindowBlockedMessage(schedule.start, clientLobbyMinutes, joinWindow)
  }, [scheduleLoad, schedule, joinWindow, clientLobbyMinutes])

  useEffect(() => {
    if (!supabase || !sessionId) return

    const channel = supabase
      .channel(`live_class_viz:${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'learning_visualizations',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload: { new: Record<string, unknown> }) => {
          const row = payload.new
          const id = row.id as string
          if (!id || seenVizIds.current.has(id)) return
          seenVizIds.current.add(id)
          vizDispatch({
            type: 'ADD_VISUALIZATION',
            payload: {
              id,
              code: row.code as string,
              library: row.library as Visualization['library'],
              explanation: row.explanation as string | undefined,
              taskDescription: (row.description as string) || undefined,
              panelDimensions: row.panel_dimensions as Visualization['panelDimensions'],
            },
          })
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [supabase, sessionId])

  const joinRoom = async () => {
    setErr('')
    setPhase('connecting')
    try {
      const { data } = await axios.get<{
        url: string
        token: string
        learningSessionId: string
        roomName: string
      }>(`/api/live-classes/${liveClassEventId}/token`)

      const learningSessionId = data.learningSessionId

      const vizRes = await axios.get<{ items: Record<string, unknown>[] }>('/api/learning/visualizations', {
        params: { session_id: learningSessionId },
      })
      const items = vizRes.data.items || []
      const mapped: Visualization[] = items.map((v) => ({
        id: v.id as string,
        code: v.code as string,
        library: v.library as Visualization['library'],
        explanation: v.explanation as string | undefined,
        taskDescription: (v.description as string) || undefined,
        panelDimensions: v.panel_dimensions as Visualization['panelDimensions'],
      }))
      seenVizIds.current = new Set(mapped.map((v) => v.id).filter(Boolean) as string[])
      if (mapped.length) {
        vizDispatch({ type: 'LOAD_VISUALIZATIONS', payload: mapped })
      } else {
        vizDispatch({ type: 'RESET' })
      }

      setSessionId(learningSessionId)

      const room = new Room({ adaptiveStream: true, dynacast: true })
      roomRef.current = room

      const attachAudio = (track: LkTrack) => {
        if (track.kind !== LkTrack.Kind.Audio) return
        const el = track.attach()
        el.autoplay = true
        audioMountRef.current?.appendChild(el)
      }

      room.on(RoomEvent.TrackSubscribed, (track) => attachAudio(track))
      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        track.detach().forEach((el) => el.remove())
      })

      await room.connect(data.url, data.token)
      try {
        await room.startAudio()
      } catch {
        /* browser may require extra gesture */
      }
      await room.localParticipant.setMicrophoneEnabled(micOn)
      setPhase('live')
    } catch (e: unknown) {
      const raw = axios.isAxiosError(e) ? e.response?.data?.error || e.message : (e as Error).message
      const msg = String(raw || '')
      const friendly =
        msg.includes('Class has ended') ||
        msg.includes('not started yet') ||
        msg.includes('Outside class window')
          ? 'This session is not open yet, or it has already ended. Check the scheduled time with your teacher.'
          : msg.includes('Not enrolled') || msg.includes('enroll')
            ? 'You are not on the roster for this class. Ask your teacher to make sure you are enrolled for your grade.'
            : msg.includes('credits') || msg.includes('Credits')
              ? 'The class cannot start because the organizer does not have enough credits. Ask your teacher or admin.'
              : msg || 'We could not connect you. Check your connection and try again.'
      setErr(friendly)
      setPhase('error')
      await disconnect()
    }
  }

  const toggleMic = async () => {
    const room = roomRef.current
    if (!room) return
    const next = !micOn
    await room.localParticipant.setMicrophoneEnabled(next)
    setMicOn(next)
  }

  return (
    <div className="flex flex-col gap-4 p-4 max-w-6xl mx-auto">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Radio className="h-5 w-5" />
            Live classroom
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            {phase !== 'live' ? (
              <Button
                onClick={() => void joinRoom()}
                disabled={phase === 'connecting' || !joinAllowed}
                title={!joinAllowed && phase !== 'connecting' ? joinBlockedHint : undefined}
              >
                {phase === 'connecting' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Connecting…
                  </>
                ) : (
                  'Join session'
                )}
              </Button>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={() => void toggleMic()}>
                  {micOn ? <Mic className="h-4 w-4 mr-1" /> : <MicOff className="h-4 w-4 mr-1" />}
                  {micOn ? 'Mute microphone' : 'Unmute microphone'}
                </Button>
                <Button variant="destructive" size="sm" onClick={() => void disconnect()}>
                  Leave session
                </Button>
              </>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
            <span>
              <span className="text-foreground font-medium">Headphones recommended.</span> They cut echo so everyone
              can hear clearly. Audio and the class tutor run in your browser; the shared board below updates for the
              whole class.
            </span>
          </p>
          {err ? <p className="text-destructive" role="alert">{err}</p> : null}
          {phase === 'lobby' && joinBlockedHint ? (
            <p className="text-muted-foreground">{joinBlockedHint}</p>
          ) : null}
          {phase === 'live' ? (
            <p className="text-foreground">
              You are connected
              {sessionId ? (
                <>
                  {' '}
                  <span className="text-muted-foreground">
                    (session <span className="font-mono text-xs">{sessionId.slice(0, 8)}…</span>)
                  </span>
                </>
              ) : null}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card className="min-h-[560px]">
        <CardHeader className="pb-2 space-y-1">
          <div className="flex flex-row flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Class board</CardTitle>
              <CardDescription className="text-xs font-normal mt-1 max-w-md">
                Demos and activities from the tutor appear here for everyone at once.
              </CardDescription>
            </div>
            <ToggleGroup type="single" value={show} onValueChange={(v) => v && setShow(v as 'render' | 'code')}>
              <ToggleGroupItem value="render">Interactive view</ToggleGroupItem>
              <ToggleGroupItem value="code">Source code</ToggleGroupItem>
            </ToggleGroup>
          </div>
        </CardHeader>
        <CardContent>
          {show === 'render' ? (
            <div ref={vizWrapRef} className="rounded-md border bg-card min-h-[480px] overflow-hidden">
              {library === 'react' && code ? <ReactRenderer code={code} /> : null}
              {library === 'p5' && code ? <LiveSketch code={code} library="p5" /> : null}
              {library === 'three' && code ? <LiveSketch code={code} library="three" /> : null}
              {!code || !library ? (
                <div className="flex flex-col items-center justify-center gap-2 h-[480px] text-muted-foreground text-center px-6">
                  <span>Nothing on the board yet.</span>
                  <span className="text-sm">When the tutor shares an activity, it will show up here for the whole class.</span>
                </div>
              ) : null}
            </div>
          ) : (
            <pre className="min-h-[480px] max-h-[560px] overflow-auto rounded-md border bg-muted/30 p-4 text-xs font-mono whitespace-pre-wrap">
              {code || '—'}
            </pre>
          )}
        </CardContent>
      </Card>

      <div ref={audioMountRef} className="sr-only" aria-hidden />
    </div>
  )
}
