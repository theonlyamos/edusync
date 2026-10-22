export type LiveClassPhase = 'now' | 'upcoming' | 'past';

type PhaseInput = {
  status?: string | null;
  scheduled_start_at: string;
  scheduled_end_at: string;
};

/**
 * Where a class sits for a student right now. A class still marked
 * "scheduled" after its end time counts as past, so stale classes never
 * crowd the top of the list.
 */
export function liveClassPhase(event: PhaseInput, now: Date): LiveClassPhase {
  const start = Date.parse(event.scheduled_start_at);
  const end = Date.parse(event.scheduled_end_at);
  const t = now.getTime();
  if (event.status === 'ended' || event.status === 'cancelled' || (Number.isFinite(end) && end <= t)) return 'past';
  if (event.status === 'live' || (Number.isFinite(start) && start <= t)) return 'now';
  return 'upcoming';
}

/** Happening now and upcoming soonest first; past classes most recent first. */
export function groupLiveClasses<T extends PhaseInput>(events: T[], now: Date) {
  const groups: Record<LiveClassPhase, T[]> = { now: [], upcoming: [], past: [] };
  for (const event of events) groups[liveClassPhase(event, now)].push(event);
  groups.now.sort((a, b) => a.scheduled_start_at.localeCompare(b.scheduled_start_at));
  groups.upcoming.sort((a, b) => a.scheduled_start_at.localeCompare(b.scheduled_start_at));
  groups.past.sort((a, b) => b.scheduled_start_at.localeCompare(a.scheduled_start_at));
  return groups;
}

/** "Starts in 10 min" for classes within a day, otherwise null (show the date). */
export function startsInLabel(start: string, now: Date): string | null {
  const minutes = Math.ceil((Date.parse(start) - now.getTime()) / 60000);
  if (!Number.isFinite(minutes) || minutes <= 0 || minutes >= 24 * 60) return null;
  if (minutes < 60) return `Starts in ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `Starts in ${hours} h${rest ? ` ${rest} min` : ''}`;
}
