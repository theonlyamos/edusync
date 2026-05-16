/** Default lobby before scheduled start; keep in sync with server (`LIVE_CLASS_LOBBY_MINUTES`). */
export const DEFAULT_LIVE_CLASS_LOBBY_MINUTES = 15

export function parseLobbyMinutes(
  raw: string | undefined | null,
  fallback = DEFAULT_LIVE_CLASS_LOBBY_MINUTES
): number {
  if (raw == null || raw === '') return fallback
  const m = Number(raw)
  return Number.isFinite(m) && m >= 0 ? m : fallback
}

let cachedClientLobbyMinutes: number | undefined

/** Parse once per page load (env is fixed at build time for NEXT_PUBLIC_*). */
export function getClientLiveClassLobbyMinutes(): number {
  if (cachedClientLobbyMinutes === undefined) {
    cachedClientLobbyMinutes = parseLobbyMinutes(process.env.NEXT_PUBLIC_LIVE_CLASS_LOBBY_MINUTES)
  }
  return cachedClientLobbyMinutes
}

/**
 * Same rules as the live-class token API: join allowed from (start − lobby) through end.
 */
export function isWithinLiveClassJoinWindow(
  startIso: string,
  endIso: string,
  opts?: { now?: Date; lobbyMinutes?: number }
): { ok: boolean; reason?: string } {
  const now = opts?.now ?? new Date()
  const lobbyMinutes = opts?.lobbyMinutes ?? DEFAULT_LIVE_CLASS_LOBBY_MINUTES
  const lobbyMs = lobbyMinutes * 60_000
  const startAt = new Date(startIso).getTime()
  const endAt = new Date(endIso).getTime()
  const t = now.getTime()
  if (Number.isNaN(startAt) || Number.isNaN(endAt)) {
    return { ok: false, reason: 'Invalid schedule' }
  }
  if (t > endAt) return { ok: false, reason: 'Class has ended' }
  if (t < startAt - lobbyMs) return { ok: false, reason: 'Class has not started yet' }
  return { ok: true }
}

/** Plain-language hint when join is blocked (same window rules as the token API). */
export function liveClassJoinWindowBlockedMessage(
  startIso: string,
  lobbyMinutes: number,
  window: { ok: boolean; reason?: string }
): string {
  if (window.ok) return ''
  if (window.reason === 'Class has ended') {
    return 'This session has ended. You can no longer join this room.'
  }
  if (window.reason === 'Class has not started yet') {
    const startMs = new Date(startIso).getTime()
    const openMs = startMs - lobbyMinutes * 60_000
    const openAt = new Date(openMs)
    return `Join opens ${lobbyMinutes} minute${lobbyMinutes === 1 ? '' : 's'} before the start (${openAt.toLocaleString()}). Class starts ${new Date(startIso).toLocaleString()}.`
  }
  if (window.reason === 'Invalid schedule') {
    return 'This class has invalid start or end times. Ask an admin to fix the schedule.'
  }
  return 'You cannot join this session right now.'
}

export type LiveClassListJoinRow = { joinAllowed: boolean; joinHint: string }

/** One Date + one pass over the list (used on teacher/student live class list pages). */
export function liveClassJoinStatesByEventId<
  T extends { id: string; scheduled_start_at: string; scheduled_end_at: string },
>(events: T[], lobbyMinutes: number, now: Date = new Date()): Map<string, LiveClassListJoinRow> {
  const m = new Map<string, LiveClassListJoinRow>()
  for (const ev of events) {
    const w = isWithinLiveClassJoinWindow(ev.scheduled_start_at, ev.scheduled_end_at, { lobbyMinutes, now })
    m.set(ev.id, {
      joinAllowed: w.ok,
      joinHint: w.ok ? '' : liveClassJoinWindowBlockedMessage(ev.scheduled_start_at, lobbyMinutes, w),
    })
  }
  return m
}
