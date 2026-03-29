'use client'

import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import { Room, RoomEvent, Track as LkTrack } from 'livekit-client'
import axios from 'axios'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { SupabaseBrowserClientContext } from '@/components/providers/SupabaseAuthProvider'
import { useLiveClassJoinTick } from '@/hooks/useLiveClassJoinTick'
import {
  getClientLiveClassLobbyMinutes,
  isWithinLiveClassJoinWindow,
  liveClassJoinWindowBlockedMessage,
} from '@/lib/live-class-window'
import { vizReducer, initialVizState, Visualization } from '@/reducers/visualizationReducer'
import { ParticipantSidebar } from './ParticipantSidebar'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  AlertTriangle,
  ArrowLeft,
  Headphones,
  Loader2,
  LogOut,
  Mic,
  MicOff,
  Radio,
  Users,
} from 'lucide-react'

const ReactRenderer = dynamic(
  () => import('@/components/lessons/ReactRenderer').then((m) => m.ReactRenderer),
  { ssr: false },
)
const LiveSketch = dynamic(
  () => import('@/components/lessons/LiveSketch').then((m) => m.LiveSketch),
  { ssr: false },
)

type Phase = 'lobby' | 'connecting' | 'live' | 'error'

interface Props {
  liveClassEventId: string
  backHref: string
  currentUserId: string
}

function useCountdown(endIso: string | null, active: boolean) {
  const [remaining, setRemaining] = useState<number | null>(null)

  useEffect(() => {
    if (!active || !endIso) {
      setRemaining(null)
      return
    }
    const update = () => {
      const ms = new Date(endIso).getTime() - Date.now()
      setRemaining(Math.max(0, Math.floor(ms / 1000)))
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [endIso, active])

  return remaining
}

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function LiveClassInteractiveTutor({
  liveClassEventId,
  backHref,
  currentUserId,
}: Props) {
  const supabase = useContext(SupabaseBrowserClientContext)
  const [vizState, vizDispatch] = useReducer(vizReducer, initialVizState)
  const { code, library } = vizState

  const clientLobbyMinutes = getClientLiveClassLobbyMinutes()
  const joinTick = useLiveClassJoinTick()

  const [eventMeta, setEventMeta] = useState<{
    title: string
    organizerId: string
    start: string
    end: string
  } | null>(null)
  const [scheduleLoad, setScheduleLoad] = useState<'idle' | 'loading' | 'error'>('loading')

  const [phase, setPhase] = useState<Phase>('lobby')
  const [err, setErr] = useState('')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [micOn, setMicOn] = useState(true)
  const [showParticipants, setShowParticipants] = useState(true)
  const roomRef = useRef<Room | null>(null)
  const audioMountRef = useRef<HTMLDivElement>(null)
  const seenVizIds = useRef<Set<string>>(new Set())

  const isHost = eventMeta?.organizerId === currentUserId
  const countdown = useCountdown(eventMeta?.end ?? null, phase === 'live')

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    if (mq.matches) setShowParticipants(false)
  }, [])

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
    setEventMeta(null)
    ;(async () => {
      try {
        const { data } = await axios.get<{
          event: {
            title?: string
            organizer_id?: string
            scheduled_start_at: string
            scheduled_end_at: string
          }
        }>(`/api/live-classes/${liveClassEventId}`)
        if (cancelled) return
        const ev = data.event
        if (ev?.scheduled_start_at && ev?.scheduled_end_at) {
          setEventMeta({
            title: ev.title || 'Live class',
            organizerId: ev.organizer_id || '',
            start: ev.scheduled_start_at,
            end: ev.scheduled_end_at,
          })
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
    if (!eventMeta) return { ok: false as const, reason: 'loading' as const }
    return isWithinLiveClassJoinWindow(eventMeta.start, eventMeta.end, {
      lobbyMinutes: clientLobbyMinutes,
      now: new Date(),
    })
  }, [eventMeta, clientLobbyMinutes, joinTick])

  const joinAllowed = scheduleLoad === 'idle' && eventMeta != null && joinWindow.ok

  const joinBlockedHint = useMemo(() => {
    if (scheduleLoad === 'loading') return 'Checking schedule…'
    if (scheduleLoad === 'error' || !eventMeta) {
      return 'Could not load class schedule. Go back and try again.'
    }
    return liveClassJoinWindowBlockedMessage(eventMeta.start, clientLobbyMinutes, joinWindow)
  }, [scheduleLoad, eventMeta, joinWindow, clientLobbyMinutes])

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
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [supabase, sessionId])

  const joinRoom = useCallback(async () => {
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

      const vizRes = await axios.get<{ items: Record<string, unknown>[] }>(
        '/api/learning/visualizations',
        { params: { session_id: learningSessionId } },
      )
      const items = vizRes.data.items || []
      const mapped: Visualization[] = items.map((v) => ({
        id: v.id as string,
        code: v.code as string,
        library: v.library as Visualization['library'],
        explanation: v.explanation as string | undefined,
        taskDescription: (v.description as string) || undefined,
        panelDimensions: v.panel_dimensions as Visualization['panelDimensions'],
      }))
      seenVizIds.current = new Set(
        mapped.map((v) => v.id).filter(Boolean) as string[],
      )
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
      const raw = axios.isAxiosError(e)
        ? e.response?.data?.error || e.message
        : (e as Error).message
      const msg = String(raw || '')
      const friendly =
        msg.includes('Class has ended') ||
        msg.includes('not started yet') ||
        msg.includes('Outside class window')
          ? 'This session is not open yet, or it has already ended. Check the scheduled time.'
          : msg.includes('Not enrolled') || msg.includes('enroll')
            ? 'You are not enrolled in this class. Ask your teacher to check your roster.'
            : msg.includes('credits') || msg.includes('Credits')
              ? 'The class cannot start because the organizer has insufficient credits.'
              : msg || 'Could not connect. Check your internet and try again.'
      setErr(friendly)
      setPhase('error')
      await disconnect()
    }
  }, [liveClassEventId, micOn, disconnect])

  const toggleMic = useCallback(async () => {
    const room = roomRef.current
    if (!room) return
    const next = !micOn
    await room.localParticipant.setMicrophoneEnabled(next)
    setMicOn(next)
  }, [micOn])

  const boardContent = useMemo(() => {
    if (library === 'react' && code) return <ReactRenderer code={code} />
    if (library === 'p5' && code) return <LiveSketch code={code} library="p5" />
    if (library === 'three' && code) return <LiveSketch code={code} library="three" />
    return null
  }, [code, library])

  const countdownColor =
    countdown !== null && countdown < 60
      ? 'text-destructive'
      : countdown !== null && countdown < 300
        ? 'text-amber-500'
        : 'text-muted-foreground'

  // ─── Lobby / connecting / error states ───────────────────────────────
  if (phase !== 'live') {
    return (
      <div className="flex h-screen flex-col bg-background">
        {/* Header */}
        <header className="flex h-12 shrink-0 items-center gap-3 border-b bg-card/60 backdrop-blur-sm px-4">
          <Link
            href={backHref}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back to classes</span>
          </Link>
          <div className="h-4 w-px bg-border" />
          <h1
            className="text-sm font-semibold truncate"
            style={{ fontFamily: 'var(--font-display), ui-serif, Georgia, serif' }}
          >
            {eventMeta?.title || 'Live class'}
          </h1>
        </header>

        {/* Center content */}
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md w-full space-y-6 text-center">
            {phase === 'connecting' ? (
              <>
                <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Connecting to class…</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Setting up audio and joining the room.
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Radio className="h-8 w-8 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">
                    {eventMeta?.title || 'Live class'}
                  </h2>
                  {eventMeta && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {new Date(eventMeta.start).toLocaleString(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                      {' – '}
                      {new Date(eventMeta.end).toLocaleTimeString(undefined, {
                        timeStyle: 'short',
                      })}
                    </p>
                  )}
                </div>

                <div className="flex items-start gap-2.5 bg-muted/50 rounded-lg p-3 text-left text-sm">
                  <Headphones className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
                  <span className="text-muted-foreground">
                    <span className="text-foreground font-medium">
                      Headphones recommended.
                    </span>{' '}
                    They reduce echo so everyone can hear clearly.
                  </span>
                </div>

                {err && (
                  <div
                    className="flex items-start gap-2.5 bg-destructive/10 rounded-lg p-3 text-left text-sm"
                    role="alert"
                  >
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-destructive" />
                    <span className="text-destructive">{err}</span>
                  </div>
                )}

                {joinBlockedHint && !err && (
                  <p className="text-sm text-muted-foreground">{joinBlockedHint}</p>
                )}

                <Button
                  size="lg"
                  className="w-full"
                  onClick={() => void joinRoom()}
                  disabled={phase === 'connecting' || !joinAllowed}
                >
                  {scheduleLoad === 'loading' ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Loading…
                    </>
                  ) : (
                    'Join session'
                  )}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ─── Live session layout ─────────────────────────────────────────────
  return (
    <div className="flex h-screen flex-col bg-background overflow-hidden">
      {/* Header bar */}
      <header className="flex h-12 shrink-0 items-center gap-3 border-b bg-card/60 backdrop-blur-sm px-4">
        <Link
          href={backHref}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Back</span>
        </Link>
        <div className="h-4 w-px bg-border" />

        <h1
          className="text-sm font-semibold truncate flex-1 min-w-0"
          style={{ fontFamily: 'var(--font-display), ui-serif, Georgia, serif' }}
        >
          {eventMeta?.title || 'Live class'}
        </h1>

        <div className="flex items-center gap-2 shrink-0">
          {countdown !== null && (
            <span
              className={cn('text-xs font-mono tabular-nums', countdownColor)}
            >
              {formatCountdown(countdown)}
            </span>
          )}
          <span className="flex items-center gap-1.5 text-xs font-medium text-primary">
            <span className="relative flex h-2 w-2">
              <span className="live-pulse absolute inline-flex h-full w-full rounded-full bg-primary" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            Live
          </span>
        </div>
      </header>

      {/* Main content: board + sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* Board area */}
        <div className="flex-1 min-w-0 overflow-hidden relative bg-muted/20">
          {boardContent ? (
            <div className="absolute inset-0">{boardContent}</div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-8">
              <div className="h-14 w-14 rounded-full bg-muted/60 flex items-center justify-center">
                <Radio className="h-6 w-6 text-muted-foreground/60" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  The board is empty
                </p>
                <p className="text-xs text-muted-foreground/70 mt-1 max-w-xs mx-auto">
                  When Eureka shares a visualization or activity, it appears
                  here for the whole class.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Participant sidebar */}
        <ParticipantSidebar
          room={roomRef.current}
          hostIdentity={eventMeta?.organizerId ?? null}
          isHost={isHost}
          liveClassEventId={liveClassEventId}
          visible={showParticipants}
        />
      </div>

      {/* Bottom toolbar */}
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-t bg-card/80 backdrop-blur-sm px-4">
        <div className="flex items-center gap-1">
          <Button
            variant={micOn ? 'secondary' : 'destructive'}
            size="icon"
            className="h-9 w-9"
            onClick={() => void toggleMic()}
            title={micOn ? 'Mute microphone' : 'Unmute microphone'}
          >
            {micOn ? (
              <Mic className="h-4 w-4" />
            ) : (
              <MicOff className="h-4 w-4" />
            )}
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant={showParticipants ? 'secondary' : 'ghost'}
            size="icon"
            className="h-9 w-9"
            onClick={() => setShowParticipants((p) => !p)}
            title={showParticipants ? 'Hide participants' : 'Show participants'}
          >
            <Users className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="destructive"
            size="sm"
            className="gap-1.5"
            onClick={() => void disconnect()}
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Leave</span>
          </Button>
        </div>
      </div>

      {/* Hidden audio mount */}
      <div ref={audioMountRef} className="sr-only" aria-hidden />
    </div>
  )
}
