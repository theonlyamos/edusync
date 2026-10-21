/** School timetables: one per grade, stored in timetables.periods and timetables.schedule. */

export const TIMETABLE_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const
export const MAX_PERIODS = 16
export const MAX_SUBJECT_LENGTH = 60

export type TimetablePeriod = { id: string; startTime: string; endTime: string }
export type TimetableCell = { subject: string; teacherId: string }
export type TimetableSchedule = Record<string, Record<string, TimetableCell>>
export type Timetable = { periods: TimetablePeriod[]; schedule: TimetableSchedule }

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const PERIOD_ID = /^[A-Za-z0-9-]{1,64}$/

const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))

/** Periods in time order. */
export function sortPeriods(periods: TimetablePeriod[]): TimetablePeriod[] {
  return [...periods].sort((a, b) => minutes(a.startTime) - minutes(b.startTime))
}

/** The next free hour-long slot after the last period, for "Add period". */
export function nextPeriodSlot(periods: TimetablePeriod[]): { startTime: string; endTime: string } {
  const last = sortPeriods(periods).at(-1)
  const start = last ? Math.min(minutes(last.endTime), 22 * 60) : 8 * 60
  const end = Math.min(start + 60, 23 * 60 + 59)
  const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  return { startTime: fmt(start), endTime: fmt(end) }
}

export type TimetableCheck = { ok: true; value: Timetable } | { ok: false; error: string }

/**
 * Checks a timetable sent by the school page. Only teachers in the same school
 * (teacherIds) are kept. Empty cells are dropped.
 */
export function validateTimetable(input: unknown, teacherIds: ReadonlySet<string>): TimetableCheck {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Send the periods and the schedule.' }
  const { periods: rawPeriods, schedule: rawSchedule } = input as { periods?: unknown; schedule?: unknown }
  if (!Array.isArray(rawPeriods)) return { ok: false, error: 'Periods must be a list.' }
  if (rawPeriods.length > MAX_PERIODS) return { ok: false, error: `A day can have at most ${MAX_PERIODS} periods.` }

  const periods: TimetablePeriod[] = []
  const ids = new Set<string>()
  for (const raw of rawPeriods) {
    const p = (raw ?? {}) as Partial<TimetablePeriod>
    if (typeof p.id !== 'string' || !PERIOD_ID.test(p.id) || ids.has(p.id)) return { ok: false, error: 'Each period needs its own id.' }
    if (typeof p.startTime !== 'string' || typeof p.endTime !== 'string' || !TIME.test(p.startTime) || !TIME.test(p.endTime)) {
      return { ok: false, error: 'Period times must look like 08:00.' }
    }
    if (minutes(p.endTime) <= minutes(p.startTime)) return { ok: false, error: `A period must end after it starts (${p.startTime}).` }
    ids.add(p.id)
    periods.push({ id: p.id, startTime: p.startTime, endTime: p.endTime })
  }
  const sorted = sortPeriods(periods)
  for (let i = 1; i < sorted.length; i++) {
    if (minutes(sorted[i].startTime) < minutes(sorted[i - 1].endTime)) {
      return { ok: false, error: `Periods ${sorted[i - 1].startTime} and ${sorted[i].startTime} overlap.` }
    }
  }

  const schedule: TimetableSchedule = {}
  if (rawSchedule !== undefined && rawSchedule !== null) {
    if (typeof rawSchedule !== 'object' || Array.isArray(rawSchedule)) return { ok: false, error: 'The schedule is not valid.' }
    for (const [day, cells] of Object.entries(rawSchedule as Record<string, unknown>)) {
      if (!(TIMETABLE_DAYS as readonly string[]).includes(day)) return { ok: false, error: `Unknown day: ${day}.` }
      if (!cells || typeof cells !== 'object' || Array.isArray(cells)) return { ok: false, error: 'The schedule is not valid.' }
      for (const [periodId, rawCell] of Object.entries(cells as Record<string, unknown>)) {
        if (!ids.has(periodId)) continue // the period was removed
        const cell = (rawCell ?? {}) as Partial<TimetableCell>
        const subject = typeof cell.subject === 'string' ? cell.subject.trim() : ''
        // A teacher who has left the school (or any id not in it) is dropped from the slot.
        const teacherId = typeof cell.teacherId === 'string' && teacherIds.has(cell.teacherId) ? cell.teacherId : ''
        if (subject.length > MAX_SUBJECT_LENGTH) return { ok: false, error: `Keep subject names under ${MAX_SUBJECT_LENGTH} characters.` }
        if (!subject && !teacherId) continue
        ;(schedule[day] ??= {})[periodId] = { subject, teacherId }
      }
    }
  }

  return { ok: true, value: { periods: sorted, schedule } }
}

/** Reads a stored row, tolerating the older shapes in the table. */
export function readTimetable(row: { periods?: unknown; schedule?: unknown } | null | undefined): Timetable {
  const periods = Array.isArray(row?.periods)
    ? (row!.periods as any[]).filter((p) => p && typeof p.id === 'string' && TIME.test(p.startTime) && TIME.test(p.endTime))
      .map((p) => ({ id: p.id as string, startTime: p.startTime as string, endTime: p.endTime as string }))
    : []
  const schedule: TimetableSchedule = {}
  if (row?.schedule && typeof row.schedule === 'object' && !Array.isArray(row.schedule)) {
    for (const [day, cells] of Object.entries(row.schedule as Record<string, any>)) {
      if (!cells || typeof cells !== 'object') continue
      for (const [periodId, cell] of Object.entries(cells as Record<string, any>)) {
        if (!cell || typeof cell !== 'object') continue
        ;(schedule[day] ??= {})[periodId] = {
          subject: typeof cell.subject === 'string' ? cell.subject : '',
          teacherId: typeof cell.teacherId === 'string' ? cell.teacherId : '',
        }
      }
    }
  }
  return { periods: sortPeriods(periods), schedule }
}

/** One teacher's lessons across every grade's timetable, for the teacher's own view. */
export function teacherSlots(
  timetables: Array<{ grade: string; timetable: Timetable }>,
  teacherId: string,
): { periods: Array<TimetablePeriod & { level: string }>; schedule: Record<string, Record<string, TimetableCell & { level: string }>> } {
  const periods: Array<TimetablePeriod & { level: string }> = []
  const schedule: Record<string, Record<string, TimetableCell & { level: string }>> = {}
  for (const { grade, timetable } of timetables) {
    const used = new Set<string>()
    for (const [day, cells] of Object.entries(timetable.schedule)) {
      for (const [periodId, cell] of Object.entries(cells)) {
        if (cell.teacherId !== teacherId) continue
        const key = `${grade}:${periodId}`
        ;(schedule[day] ??= {})[key] = { ...cell, level: grade }
        used.add(periodId)
      }
    }
    for (const period of timetable.periods) {
      if (used.has(period.id)) periods.push({ ...period, id: `${grade}:${period.id}`, level: grade })
    }
  }
  periods.sort((a, b) => minutes(a.startTime) - minutes(b.startTime))
  return { periods, schedule }
}

/** "08:00 – 09:00" shown in the person's own clock style. */
export function formatPeriodTime(period: { startTime: string; endTime: string }): string {
  const fmt = (time: string) =>
    TIME.test(time)
      ? new Date(`1970-01-01T${time}:00`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : time
  return `${fmt(period.startTime)} – ${fmt(period.endTime)}`
}
