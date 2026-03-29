'use client'

import { memo, useCallback, useEffect, useRef, useState } from 'react'
import type { Room, RemoteParticipant, Participant, LocalParticipant } from 'livekit-client'
import { RoomEvent } from 'livekit-client'
import axios from 'axios'
import { Bot, Crown, Mic, MicOff, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ParticipantEntry = {
  identity: string
  name: string
  isSpeaking: boolean
  isMicrophoneEnabled: boolean
  isLocal: boolean
}

const AVATAR_COLORS = [
  'bg-emerald-600', 'bg-sky-600', 'bg-violet-600', 'bg-rose-600',
  'bg-amber-600', 'bg-teal-600', 'bg-indigo-600', 'bg-pink-600',
  'bg-cyan-600', 'bg-orange-600', 'bg-fuchsia-600', 'bg-lime-700',
]
const colorCache = new Map<string, string>()

function avatarColor(identity: string): string {
  const cached = colorCache.get(identity)
  if (cached) return cached
  let hash = 0
  for (let i = 0; i < identity.length; i++) {
    hash = ((hash << 5) - hash + identity.charCodeAt(i)) | 0
  }
  const color = AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
  colorCache.set(identity, color)
  return color
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

function isAgentParticipant(p: { identity: string; name: string }): boolean {
  const id = p.identity.toLowerCase()
  const n = p.name.toLowerCase()
  return id.startsWith('agent-') || n.includes('eureka') || n.includes('agent')
}

function buildSnapshot(room: Room): Map<string, ParticipantEntry> {
  const m = new Map<string, ParticipantEntry>()
  const add = (p: Participant | LocalParticipant | RemoteParticipant, isLocal: boolean) => {
    m.set(p.identity, {
      identity: p.identity,
      name: p.name || p.identity,
      isSpeaking: p.isSpeaking,
      isMicrophoneEnabled: p.isMicrophoneEnabled,
      isLocal,
    })
  }
  add(room.localParticipant, true)
  room.remoteParticipants.forEach((rp) => add(rp, false))
  return m
}

interface ParticipantSidebarProps {
  room: Room | null
  hostIdentity: string | null
  isHost: boolean
  liveClassEventId: string
  visible: boolean
}

function ParticipantSidebarInner({
  room,
  hostIdentity,
  isHost,
  liveClassEventId,
  visible,
}: ParticipantSidebarProps) {
  const [participants, setParticipants] = useState<Map<string, ParticipantEntry>>(new Map())
  const speakerRafRef = useRef(0)
  const latestSpeakersRef = useRef<Set<string>>(new Set())

  const refresh = useCallback(() => {
    if (!room) return
    setParticipants(buildSnapshot(room))
  }, [room])

  useEffect(() => {
    if (!room) {
      setParticipants(new Map())
      return
    }

    setParticipants(buildSnapshot(room))

    const onConnect = () => refresh()
    const onDisconnect = () => refresh()

    const onSpeakersChanged = (speakers: Participant[]) => {
      latestSpeakersRef.current = new Set(speakers.map((s) => s.identity))
      if (speakerRafRef.current) return
      speakerRafRef.current = requestAnimationFrame(() => {
        speakerRafRef.current = 0
        setParticipants((prev) => {
          const next = new Map(prev)
          let changed = false
          for (const [id, entry] of next) {
            const speaking = latestSpeakersRef.current.has(id)
            if (entry.isSpeaking !== speaking) {
              next.set(id, { ...entry, isSpeaking: speaking })
              changed = true
            }
          }
          return changed ? next : prev
        })
      })
    }

    const onTrackMuted = () => refresh()
    const onTrackUnmuted = () => refresh()

    room.on(RoomEvent.ParticipantConnected, onConnect)
    room.on(RoomEvent.ParticipantDisconnected, onDisconnect)
    room.on(RoomEvent.ActiveSpeakersChanged, onSpeakersChanged)
    room.on(RoomEvent.TrackMuted, onTrackMuted)
    room.on(RoomEvent.TrackUnmuted, onTrackUnmuted)

    return () => {
      room.off(RoomEvent.ParticipantConnected, onConnect)
      room.off(RoomEvent.ParticipantDisconnected, onDisconnect)
      room.off(RoomEvent.ActiveSpeakersChanged, onSpeakersChanged)
      room.off(RoomEvent.TrackMuted, onTrackMuted)
      room.off(RoomEvent.TrackUnmuted, onTrackUnmuted)
      if (speakerRafRef.current) cancelAnimationFrame(speakerRafRef.current)
    }
  }, [room, refresh])

  const handleMuteToggle = useCallback(
    async (entry: ParticipantEntry) => {
      if (!isHost || !room || entry.isLocal) return

      const newMuted = entry.isMicrophoneEnabled
      setParticipants((prev) => {
        const next = new Map(prev)
        const p = next.get(entry.identity)
        if (p) next.set(entry.identity, { ...p, isMicrophoneEnabled: !newMuted })
        return next
      })

      const rp = room.remoteParticipants.get(entry.identity)
      if (!rp) return
      const audioTrack = Array.from(rp.audioTrackPublications.values()).find(
        (pub) => pub.trackSid,
      )
      if (!audioTrack?.trackSid) return

      try {
        await axios.post(`/api/live-classes/${liveClassEventId}/mute`, {
          participantIdentity: entry.identity,
          trackSid: audioTrack.trackSid,
          muted: newMuted,
        })
      } catch {
        setParticipants((prev) => {
          const next = new Map(prev)
          const p = next.get(entry.identity)
          if (p) next.set(entry.identity, { ...p, isMicrophoneEnabled: newMuted })
          return next
        })
      }
    },
    [isHost, room, liveClassEventId],
  )

  const sorted = Array.from(participants.values()).sort((a, b) => {
    const aHost = a.identity === hostIdentity ? 0 : 1
    const bHost = b.identity === hostIdentity ? 0 : 1
    if (aHost !== bHost) return aHost - bHost
    const aAgent = isAgentParticipant(a) ? 0 : 1
    const bAgent = isAgentParticipant(b) ? 0 : 1
    if (aAgent !== bAgent) return aAgent - bAgent
    return a.name.localeCompare(b.name)
  })

  return (
    <aside
      className={cn(
        'border-l bg-card/80 backdrop-blur-sm flex flex-col transition-all duration-300 ease-out overflow-hidden',
        visible ? 'w-64 min-w-[16rem]' : 'w-0 min-w-0 border-l-0',
      )}
    >
      {visible && (
        <>
          <div className="px-4 py-3 border-b flex items-center gap-2 shrink-0">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">
              {participants.size} participant{participants.size !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
            {sorted.map((entry, i) => {
              const isEntryHost = entry.identity === hostIdentity
              const isAgent = isAgentParticipant(entry)
              const canMute = isHost && !entry.isLocal && !isAgent

              return (
                <div
                  key={entry.identity}
                  className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-muted/50 transition-colors"
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  <div
                    className={cn(
                      'relative h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0 select-none',
                      isAgent ? 'bg-primary' : avatarColor(entry.identity),
                      entry.isSpeaking && 'speaking-ring',
                    )}
                  >
                    {isAgent ? (
                      <Bot className="h-4 w-4" />
                    ) : (
                      initials(entry.name)
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm truncate">
                        {entry.name}
                        {entry.isLocal && (
                          <span className="text-muted-foreground ml-1 text-xs">(you)</span>
                        )}
                      </span>
                      {isEntryHost && (
                        <Crown className="h-3 w-3 text-amber-500 shrink-0" title="Host" />
                      )}
                    </div>
                  </div>
                  {!isAgent && (
                    <button
                      type="button"
                      onClick={canMute ? () => void handleMuteToggle(entry) : undefined}
                      className={cn(
                        'shrink-0 p-1 rounded transition-colors',
                        canMute
                          ? 'hover:bg-muted cursor-pointer'
                          : 'cursor-default',
                      )}
                      title={
                        canMute
                          ? entry.isMicrophoneEnabled ? 'Mute this participant' : 'Unmute this participant'
                          : entry.isMicrophoneEnabled ? 'Mic on' : 'Mic off'
                      }
                      aria-label={
                        entry.isMicrophoneEnabled ? `${entry.name} mic on` : `${entry.name} mic off`
                      }
                    >
                      {entry.isMicrophoneEnabled ? (
                        <Mic className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <MicOff className="h-3.5 w-3.5 text-destructive/70" />
                      )}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </aside>
  )
}

export const ParticipantSidebar = memo(ParticipantSidebarInner)
