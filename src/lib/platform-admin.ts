/** Rules and shapes for the platform admin portal (browser-safe). */

import { CREDIT_PRICE_CENTS } from '@/lib/school-billing'

/** Why an account cannot be made a platform admin, or null when it can. */
export function adminPromotionProblem(role: string | null | undefined): string | null {
  if (role === 'admin') return 'That account is already a platform admin.'
  if (role === 'teacher' || role === 'student') {
    return 'That is a teacher or student account. Use a separate account for support work.'
  }
  return null
}

export const MAX_ADMIN_GRANT = 100_000
export const MAX_TRIAL_EXTENSION_DAYS = 90
export const TRIAL_ENDING_DAYS = 5
export const MAX_REASON = 300

/** Dollars a number of credits sold for. */
export const creditsToDollars = (credits: number) => (credits * CREDIT_PRICE_CENTS) / 100

export const formatDollars = (dollars: number) =>
  dollars.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: dollars % 1 === 0 ? 0 : 2 })

/** A whole number of credits an admin may grant, or null. */
export function parseGrantCredits(value: unknown): number | null {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > MAX_ADMIN_GRANT) return null
  return n
}

/** Days to extend a trial by, or null. */
export function parseTrialDays(value: unknown): number | null {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > MAX_TRIAL_EXTENSION_DAYS) return null
  return n
}

/** A short reason, required for actions that change money or access. */
export function parseReason(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const reason = value.replace(/\s+/g, ' ').trim()
  return reason && reason.length <= MAX_REASON ? reason : null
}

/** "2026-10" for a date, in UTC. */
export const monthKey = (date: Date | string) => new Date(date).toISOString().slice(0, 7)

/** The last `count` month keys, oldest first. */
export function lastMonths(count: number, now: Date = new Date()): string[] {
  const out: string[] = []
  for (let i = count - 1; i >= 0; i--) {
    out.push(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)).toISOString().slice(0, 7))
  }
  return out
}

/** The last `count` day keys ("2026-10-26", UTC), oldest first. */
export function lastDays(count: number, now: Date = new Date()): string[] {
  const out: string[] = []
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  for (let i = count - 1; i >= 0; i--) out.push(new Date(today - i * 86_400_000).toISOString().slice(0, 10))
  return out
}

export const monthLabel = (key: string) =>
  new Date(`${key}-01T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' })

/** Percent change from `before` to `now`; null when there's nothing to compare. */
export function change(now: number, before: number): number | null {
  if (before === 0) return now === 0 ? 0 : null
  return Math.round(((now - before) / before) * 100)
}

export type Trend = { thisMonth: number; lastMonth: number }

export type AttentionItem = {
  kind: 'trial_ending' | 'low_credits' | 'failed_jobs' | 'poor_feedback' | 'suspended'
  title: string
  detail: string
  href: string
}

export type PlatformOverview = {
  schools: { total: number; active: number; suspended: number; newThisMonth: number; activeLast7Days: number }
  users: { total: number; students: number; teachers: number; learners: number; admins: number; newThisMonth: number; activeLast7Days: number }
  revenue: Trend & { creditsSoldThisMonth: number }
  voiceMinutes: Trend
  liveClassMinutes: Trend
  visuals: Trend
  images: Trend
  daily: Array<{ date: string; signups: number; voiceMinutes: number; revenue: number }>
  attention: AttentionItem[]
}

export type AdminSchoolRow = {
  id: string
  name: string
  country: string | null
  isActive: boolean
  isDefault: boolean
  createdAt: string
  owner: { id: string; name: string | null; email: string | null } | null
  students: number
  teachers: number
  admins: number
  credits: { paid: number; trial: number; total: number; trialExpiresAt: string | null; trialActive: boolean; low: boolean }
  purchased: number
  lastActivityAt: string | null
}

export type AdminMember = {
  userId: string
  name: string | null
  email: string | null
  role: string
  isActive: boolean
  lastLogin: string | null
}

export type AdminLedgerRow = {
  id: string
  type: string
  usageKind: string | null
  credits: number
  balanceAfter: number | null
  description: string | null
  createdAt: string
  by: string | null
}

export type AdminSchoolDetail = AdminSchoolRow & {
  description: string | null
  timezone: string | null
  gradeLevels: string[]
  members: AdminMember[]
  ledger: AdminLedgerRow[]
  usage: Array<{ month: string; voice: number; liveClass: number; visuals: number; images: number }>
  lessons: { total: number; published: number; recent: Array<{ id: string; title: string; subject: string | null; createdAt: string; published: boolean; archived: boolean }> }
  activity: ActivityRow[]
}

export type AdminUserRow = {
  id: string
  email: string | null
  name: string | null
  role: string
  isActive: boolean
  credits: number
  lastLogin: string | null
  createdAt: string
  school: { id: string; name: string; role: string } | null
}

export type AdminUserDetail = AdminUserRow & {
  purchased: number
  used: number
  ledger: AdminLedgerRow[]
  sessions: Array<{ id: string; topic: string | null; createdAt: string; endedAt: string | null; embedded: boolean }>
  feedback: FeedbackRow[]
  activity: ActivityRow[]
}

export type BillingRow = {
  id: string
  at: string
  kind: 'purchase' | 'grant' | 'refund' | 'trial'
  credits: number
  dollars: number
  payer: 'school' | 'person'
  name: string
  href: string
  description: string | null
  stripePaymentIntent: string | null
}

export type BillingSummary = {
  months: Array<{ month: string; dollars: number; credits: number; schoolDollars: number; personDollars: number; granted: number }>
  totals: { dollars: number; credits: number; granted: number; purchases: number }
  rows: BillingRow[]
}

export type UsageSummary = {
  days: Array<{ date: string; voice: number; liveClass: number; visuals: number; images: number }>
  totals: { voice: number; liveClass: number; visuals: number; images: number; sessions: number; embedSessions: number }
  topSchools: Array<{ id: string; name: string; voice: number; liveClass: number; visuals: number; images: number }>
  jobs: { succeeded: number; failed: number; pending: number; failures: Array<{ id: string; type: string; error: string | null; at: string; schoolId: string | null; schoolName: string | null; lessonId: string | null }> }
}

export type FeedbackRow = {
  id: string
  rating: string | null
  experience: string | null
  improvements: string | null
  wouldRecommend: string | null
  trigger: string | null
  error: string | null
  durationSeconds: number | null
  createdAt: string
  user: { id: string; name: string | null; email: string | null } | null
}

export type ActivityRow = {
  id: string
  action: string
  targetType: string
  targetId: string | null
  targetLabel: string | null
  details: Record<string, unknown>
  createdAt: string
  admin: { id: string; name: string | null; email: string | null } | null
}

/** How an audit entry reads in the activity log. */
export function describeAction(row: Pick<ActivityRow, 'action' | 'details' | 'targetLabel'>): string {
  const d = row.details ?? {}
  const who = row.targetLabel ?? 'someone'
  switch (row.action) {
    case 'school.grant_credits':
      return `Gave ${who} ${Number(d.credits ?? 0).toLocaleString()} credits`
    case 'school.extend_trial':
      return `Extended ${who}'s trial by ${d.days} days`
    case 'school.suspend':
      return `Suspended ${who}`
    case 'school.reactivate':
      return `Reactivated ${who}`
    case 'school.transfer_owner':
      return `Made ${String(d.newOwnerEmail ?? 'someone')} the owner of ${who}`
    case 'user.grant_credits':
      return `Gave ${who} ${Number(d.credits ?? 0).toLocaleString()} credits`
    case 'user.deactivate':
      return `Deactivated ${who}`
    case 'user.reactivate':
      return `Reactivated ${who}`
    case 'user.password_reset':
      return `Sent ${who} a password reset`
    case 'admin.add':
      return `Made ${who} a platform admin`
    case 'admin.remove':
      return `Removed ${who}'s platform admin access`
    default:
      return `${row.action} · ${who}`
  }
}

export const ROLE_LABEL: Record<string, string> = {
  admin: 'Platform admin',
  teacher: 'Teacher',
  student: 'Student',
  learner: 'Learner',
  owner: 'Owner',
  member: 'Member',
}
