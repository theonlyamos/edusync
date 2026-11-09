import { isDay } from '@/lib/school-records';

export const CALENDAR_KINDS = ['term', 'holiday', 'exam', 'event'] as const;
export type CalendarKind = (typeof CALENDAR_KINDS)[number];

export const CALENDAR_KIND_LABEL: Record<CalendarKind, string> = {
  term: 'Term',
  holiday: 'Holiday',
  exam: 'Exams',
  event: 'Event',
};

export const CALENDAR_TITLE_MAX = 80;
/** The longest a single entry may run, in days. */
export const CALENDAR_MAX_DAYS = 400;
export const CALENDAR_MAX_ENTRIES = 300;

export type CalendarEntry = {
  id: string;
  kind: CalendarKind;
  title: string;
  startsOn: string;
  endsOn: string;
};

export type CalendarInput = Omit<CalendarEntry, 'id'>;

export const isCalendarKind = (value: unknown): value is CalendarKind => CALENDAR_KINDS.includes(value as CalendarKind);

/** Checks what an admin typed. Returns the clean entry, or the message to show. */
export function parseCalendarInput(body: unknown): CalendarInput | string {
  const input = (body ?? {}) as Record<string, unknown>;
  if (!isCalendarKind(input.kind)) return 'Pick what kind of entry this is';
  const title = typeof input.title === 'string' ? input.title.trim().replace(/\s+/g, ' ') : '';
  if (!title) return 'Give it a name';
  if (title.length > CALENDAR_TITLE_MAX) return `Keep the name under ${CALENDAR_TITLE_MAX} characters`;
  const startsOn = input.startsOn;
  const endsOn = input.endsOn || input.startsOn;
  if (!isDay(startsOn) || !isDay(endsOn)) return 'Pick valid dates';
  if (endsOn < startsOn) return 'The last day can’t be before the first day';
  if (Date.parse(endsOn) - Date.parse(startsOn) > CALENDAR_MAX_DAYS * 24 * 60 * 60 * 1000) return 'That is too long for one entry';
  return { kind: input.kind, title, startsOn, endsOn };
}

export const coversDay = (entry: Pick<CalendarEntry, 'startsOn' | 'endsOn'>, day: string) => entry.startsOn <= day && day <= entry.endsOn;

/** Oldest first; a longer entry comes before a shorter one starting the same day. */
export function sortEntries<T extends Pick<CalendarEntry, 'startsOn' | 'endsOn' | 'title'>>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => a.startsOn.localeCompare(b.startsOn) || b.endsOn.localeCompare(a.endsOn) || a.title.localeCompare(b.title));
}

/** The term a day falls in, or null between terms. */
export function termOn(entries: readonly CalendarEntry[], day: string): CalendarEntry | null {
  return sortEntries(entries.filter((entry) => entry.kind === 'term' && coversDay(entry, day)))[0] ?? null;
}

/** The holiday covering a day, if any: a reason there is no school. */
export function holidayOn(entries: readonly CalendarEntry[], day: string): CalendarEntry | null {
  return sortEntries(entries.filter((entry) => entry.kind === 'holiday' && coversDay(entry, day)))[0] ?? null;
}

/** Whether another term overlaps this one (terms should not). */
export function overlappingTerm(entries: readonly CalendarEntry[], candidate: CalendarInput, ignoreId?: string): CalendarEntry | null {
  if (candidate.kind !== 'term') return null;
  return entries.find((entry) => entry.kind === 'term' && entry.id !== ignoreId && entry.startsOn <= candidate.endsOn && candidate.startsOn <= entry.endsOn) ?? null;
}

/** Splits entries into what is on now, what is coming and what has passed. */
export function groupByTime(entries: readonly CalendarEntry[], today: string) {
  const sorted = sortEntries(entries);
  return {
    now: sorted.filter((entry) => coversDay(entry, today)),
    upcoming: sorted.filter((entry) => entry.startsOn > today),
    past: sorted.filter((entry) => entry.endsOn < today).reverse(),
  };
}

/** Whole days from `today` until the entry starts (0 when it has started). */
export function daysUntil(entry: Pick<CalendarEntry, 'startsOn'>, today: string): number {
  return Math.max(0, Math.round((Date.parse(entry.startsOn) - Date.parse(today)) / (24 * 60 * 60 * 1000)));
}
