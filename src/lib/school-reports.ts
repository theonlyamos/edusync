import { csvCell } from '@/lib/school-people'

/** The periods the Reports page offers, in days. */
export const REPORT_RANGES = [7, 30, 90, 365] as const
export type ReportRange = (typeof REPORT_RANGES)[number]

export const REPORT_RANGE_LABEL: Record<ReportRange, string> = {
  7: 'Last 7 days',
  30: 'Last 30 days',
  90: 'Last 90 days',
  365: 'Last 12 months',
}

export function parseReportRange(value: unknown, fallback: ReportRange = 30): ReportRange {
  const n = Number(value)
  return (REPORT_RANGES as readonly number[]).includes(n) ? (n as ReportRange) : fallback
}

export const USAGE_KINDS = ['voice', 'live_class', 'visual', 'image'] as const
export type UsageKind = (typeof USAGE_KINDS)[number]

export const USAGE_KIND_LABEL: Record<UsageKind, string> = {
  voice: 'AI tutor minutes',
  live_class: 'Live classes',
  visual: 'Lesson visuals',
  image: 'Lesson images',
}

export type CreditsByKind = Record<UsageKind, number>

export const emptyCredits = (): CreditsByKind => ({ voice: 0, live_class: 0, visual: 0, image: 0 })

/** Credits a usage row really cost: the charge less anything refunded. */
export function netUsage(row: { credits: number | string | null; refunded_credits?: number | string | null }): number {
  const charged = -(Number(row.credits) || 0)
  return Math.max(0, charged - (Number(row.refunded_credits) || 0))
}

/** The calendar day (YYYY-MM-DD) of a moment in the school's time zone. */
export function dayKey(at: Date | string, timeZone?: string | null): string {
  const date = typeof at === 'string' ? new Date(at) : at
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
  } catch {
    return date.toISOString().slice(0, 10)
  }
}

/** Each day in the period, oldest first, ending with today. */
export function periodDays(to: Date, days: number, timeZone?: string | null): string[] {
  const keys: string[] = []
  const seen = new Set<string>()
  // Step back in 24h jumps; a DST change can repeat or skip a key, so dedupe.
  for (let i = days - 1; i >= 0; i -= 1) {
    const key = dayKey(new Date(to.getTime() - i * 24 * 60 * 60 * 1000), timeZone)
    if (!seen.has(key)) {
      seen.add(key)
      keys.push(key)
    }
  }
  return keys
}

/** Change from the previous period as a whole percentage, or null when there's nothing to compare with. */
export function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return null
  return Math.round(((current - previous) / previous) * 100)
}

export type ReportPersonRole = 'student' | 'teacher' | 'admin' | 'owner' | 'former'

export type PersonUsage = {
  userId: string
  name: string
  email: string
  role: ReportPersonRole
  grade: string | null
  isActive: boolean
  credits: CreditsByKind & { total: number }
  visuals: number
  images: number
  tutorSessions: number
  lessonsStudied: number
  homeworkSubmitted: number
  lastActiveAt: string | null
}

export type TeacherActivity = {
  userId: string
  name: string
  isActive: boolean
  lessonsCreated: number
  lessonsPublished: number
  homeworkSet: number
  liveClassesHeld: number
  creditsUsed: number
}

/** One subject's lessons, homework and studying. subjectId null is "Other". */
export type SubjectActivity = {
  subjectId: string | null
  name: string
  color: string | null
  /** Lessons on the subject, all time. */
  lessons: number
  lessonsPublished: number
  homeworkSet: number
  studentsStudying: number
  homeworkSubmitted: number
}

export type DailyActivity = { date: string; activeStudents: number; creditsUsed: number; submissions: number }

export type WeekStats = { activeStudents: number; creditsUsed: number; submissions: number }

export type SchoolReport = {
  range: { from: string; to: string; days: number }
  /** The last 7 days and the 7 before them, for week-on-week trends. */
  weeks: { thisWeek: WeekStats; lastWeek: WeekStats }
  timezone: string
  totals: {
    creditsUsed: number
    creditsByKind: CreditsByKind
    creditsPurchased: number
    students: number
    activeStudents: number
    teachers: number
    activeTeachers: number
    tutorSessions: number
    lessonsStudied: number
    homeworkSubmitted: number
    lessonsPublished: number
    homeworkSet: number
    liveClassesHeld: number
  }
  daily: DailyActivity[]
  people: PersonUsage[]
  teachers: TeacherActivity[]
  /** Empty when the school has no subject list. */
  subjects: SubjectActivity[]
}

const ROLE_LABEL: Record<ReportPersonRole, string> = {
  student: 'Student',
  teacher: 'Teacher',
  admin: 'Administrator',
  owner: 'Owner',
  former: 'No longer at the school',
}

export const reportRoleLabel = (role: ReportPersonRole) => ROLE_LABEL[role]

/** The per-person usage table as a CSV for spreadsheets. */
export function reportPeopleCsv(report: Pick<SchoolReport, 'people'>): string {
  const header = [
    'name', 'email', 'role', 'grade', 'status',
    'credits_total', 'credits_ai_tutor', 'credits_live_class', 'credits_visuals', 'credits_images',
    'tutor_sessions', 'lessons_studied', 'homework_submitted', 'visuals_made', 'images_made', 'last_active',
  ]
  const rows = report.people.map((p) => [
    p.name, p.email, ROLE_LABEL[p.role], p.grade ?? '', p.isActive ? 'active' : 'deactivated',
    p.credits.total, p.credits.voice, p.credits.live_class, p.credits.visual, p.credits.image,
    p.tutorSessions, p.lessonsStudied, p.homeworkSubmitted, p.visuals, p.images, p.lastActiveAt ?? '',
  ].map((v) => csvCell(String(v))).join(','))
  return [header.join(','), ...rows].join('\n') + '\n'
}

/** The teaching table as a CSV. */
export function reportTeachersCsv(report: Pick<SchoolReport, 'teachers'>): string {
  const header = ['name', 'status', 'lessons_created', 'lessons_published', 'homework_set', 'live_classes_held', 'credits_used']
  const rows = report.teachers.map((t) => [
    t.name, t.isActive ? 'active' : 'deactivated', t.lessonsCreated, t.lessonsPublished, t.homeworkSet, t.liveClassesHeld, t.creditsUsed,
  ].map((v) => csvCell(String(v))).join(','))
  return [header.join(','), ...rows].join('\n') + '\n'
}
