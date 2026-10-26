import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createServerSupabase } from '@/lib/supabase.server'
import { schoolBalance, LOW_BALANCE_CREDITS } from '@/lib/school-billing'
import {
  TRIAL_ENDING_DAYS,
  creditsToDollars,
  lastDays,
  lastMonths,
  monthKey,
  type ActivityRow,
  type AdminLedgerRow,
  type AdminMember,
  type AdminSchoolDetail,
  type AdminSchoolRow,
  type AdminUserDetail,
  type AdminUserRow,
  type AttentionItem,
  type BillingRow,
  type BillingSummary,
  type FeedbackRow,
  type PlatformOverview,
  type UsageSummary,
} from '@/lib/platform-admin'

export type PlatformAdminContext = {
  adminId: string
  supabase: ReturnType<typeof createServerSupabase>
}
type Supabase = PlatformAdminContext['supabase']
type Row = Record<string, any>

/** Platform support staff only (users.role = 'admin'). */
export async function requirePlatformAdmin(): Promise<
  { ok: true; context: PlatformAdminContext } | { ok: false; response: NextResponse }
> {
  const session = await getServerSession()
  if (!session?.user) return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (session.user.role !== 'admin') return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { ok: true, context: { adminId: session.user.id, supabase: createServerSupabase() } }
}

/** Shown wherever the old screens let support create accounts with a typed password. */
export const ACCOUNTS_COME_FROM_SCHOOLS =
  'Support no longer creates accounts. Schools invite their teachers and students from the People tab, and anyone else can sign up.'

/** A problem the admin can fix, with the status to answer with. */
export class AdminError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

export function adminErrorResponse(error: unknown, fallback: string, where: string) {
  if (error instanceof AdminError) return NextResponse.json({ error: error.message }, { status: error.status })
  console.error(`Error in ${where}:`, error)
  return NextResponse.json({ error: fallback }, { status: 500 })
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value)

async function all(query: PromiseLike<{ data: Row[] | null; error: unknown }>): Promise<Row[]> {
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

const PAGE = 1000
/** Most rows the portal reads for one figure; past this, totals undercount. */
export const MAX_ROWS = 50_000

/**
 * Reads every matching row, 1,000 at a time (the API's cap per request).
 * `build` must give a fresh query with a stable order (end with .order('id')).
 */
async function every(build: () => any, max = MAX_ROWS): Promise<Row[]> {
  const out: Row[] = []
  for (let from = 0; from < max; from += PAGE) {
    const { data, error } = await build().range(from, Math.min(from + PAGE, max) - 1)
    if (error) throw error
    out.push(...(data ?? []))
    if (!data || data.length < PAGE) break
  }
  return out
}

/** Runs one query per 200 ids (paging each one) and joins the rows. */
async function byIds(ids: readonly string[], run: (ids: string[]) => any): Promise<Row[]> {
  const unique = [...new Set(ids.filter(Boolean))]
  const out: Row[] = []
  for (let i = 0; i < unique.length; i += 200) {
    const part = unique.slice(i, i + 200)
    out.push(...(await every(() => run(part))))
  }
  return out
}

const startOfMonth = (now: Date, back = 0) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1))
const later = (a: string | null, b: string | null) => (!a ? b : !b ? a : a > b ? a : b)
const usedCredits = (row: Row) => Math.max(0, -(Number(row.credits) || 0) - (Number(row.refunded_credits) || 0))

/**
 * Adds `schoolName` to each row, from the person's active school membership.
 * Support lists cover every school, so staff need to see which one a person is in.
 */
export async function withSchoolNames<T extends { id: string }>(supabase: Supabase, rows: T[]): Promise<Array<T & { schoolName: string | null }>> {
  const schools = await schoolsOf(supabase, rows.map((r) => r.id)).catch((error) => {
    console.error('Could not load school names:', error)
    return new Map<string, { id: string; name: string; role: string }>()
  })
  return rows.map((row) => ({ ...row, schoolName: schools.get(row.id)?.name ?? null }))
}

/** Each person's school (active membership of a school), by user id. */
async function schoolsOf(supabase: Supabase, userIds: string[]) {
  const rows = await byIds(userIds, (ids) =>
    supabase.from('organization_members').select('user_id, role, organizations!inner(id, name, type)').eq('is_active', true).eq('organizations.type', 'school').in('user_id', ids),
  )
  const out = new Map<string, { id: string; name: string; role: string }>()
  for (const row of rows) {
    const org = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations
    if (org?.id) out.set(row.user_id as string, { id: org.id, name: org.name, role: row.role })
  }
  return out
}

async function usersById(supabase: Supabase, ids: string[]) {
  const rows = await byIds(ids, (part) => supabase.from('users').select('id, name, email').in('id', part))
  return new Map(rows.map((u) => [u.id as string, { id: u.id as string, name: (u.name as string | null) ?? null, email: (u.email as string | null) ?? null }]))
}

/** Records what an admin did. Never blocks the action itself. */
export async function logAdminAction(
  context: PlatformAdminContext,
  entry: { action: string; targetType: 'school' | 'organization' | 'user'; targetId: string | null; targetLabel: string | null; details?: Record<string, unknown> },
) {
  const { error } = await context.supabase.from('platform_admin_actions').insert({
    admin_id: context.adminId,
    action: entry.action,
    target_type: entry.targetType,
    target_id: entry.targetId,
    target_label: entry.targetLabel,
    details: entry.details ?? {},
  })
  if (error) console.error('Could not record admin action:', entry.action, error)
}

// ---------------------------------------------------------------- overview

export async function getPlatformOverview(supabase: Supabase, now: Date = new Date()): Promise<PlatformOverview> {
  const thisMonth = startOfMonth(now).toISOString()
  const lastMonth = startOfMonth(now, 1).toISOString()
  const since30 = new Date(now.getTime() - 30 * 86_400_000).toISOString()
  const since7 = new Date(now.getTime() - 7 * 86_400_000).toISOString()
  const windowStart = since30 < lastMonth ? since30 : lastMonth

  const [schools, recentUsers, personalTx, schoolTx, grants, aiUsage, visuals, jobs, feedback] = await Promise.all([
    every(() => supabase.from('organizations').select('id, name, is_active, created_at, credits, trial_credits, trial_expires_at').eq('type', 'school').order('id')),
    every(() => supabase.from('users').select('created_at').gte('created_at', since30).order('id')),
    every(() => supabase.from('credit_transactions').select('transaction_type, credits, created_at').eq('transaction_type', 'purchase').gte('created_at', windowStart).order('id')),
    every(() => supabase.from('organization_credit_transactions').select('organization_id, transaction_type, usage_kind, credits, refunded_credits, created_at').gte('created_at', windowStart).order('id')),
    every(() => supabase.from('voice_session_grants').select('minutes_charged, created_at').gte('created_at', windowStart).order('id')),
    every(() => supabase.from('organization_ai_usage').select('organization_id, category, quantity, refunded_at, created_at').gte('created_at', windowStart).order('id')),
    every(() => supabase.from('learning_visualizations').select('created_at').gte('created_at', windowStart).order('id')),
    every(() => supabase.from('content_jobs').select('status, created_at').eq('status', 'failed').gte('created_at', since7).order('id')),
    every(() => supabase.from('feedback').select('rating, created_at').eq('rating', 'negative').gte('created_at', since30).order('id')),
  ])
  // Counts, not rows: the API returns at most 1,000 rows per query.
  const countUsers = async (filter?: (q: any) => any) => {
    const base = supabase.from('users').select('id', { count: 'exact', head: true })
    const { count, error } = await (filter ? filter(base) : base)
    if (error) throw error
    return count ?? 0
  }
  const [userTotal, students, teachers, learners, admins, usersNewThisMonth, usersActive7] = await Promise.all([
    countUsers(),
    countUsers((q) => q.eq('role', 'student')),
    countUsers((q) => q.eq('role', 'teacher')),
    countUsers((q) => q.eq('role', 'learner')),
    countUsers((q) => q.eq('role', 'admin')),
    countUsers((q) => q.gte('created_at', thisMonth)),
    countUsers((q) => q.gte('lastlogin', since7)),
  ])

  const trend = (rows: Row[], value: (r: Row) => number) => {
    let a = 0
    let b = 0
    for (const r of rows) {
      const at = String(r.created_at)
      if (at >= thisMonth) a += value(r)
      else if (at >= lastMonth) b += value(r)
    }
    return { thisMonth: a, lastMonth: b }
  }

  const schoolPurchases = schoolTx.filter((t) => t.transaction_type === 'purchase')
  const purchases = [...personalTx, ...schoolPurchases]
  const credits = trend(purchases, (r) => Number(r.credits) || 0)
  const liveClass = schoolTx.filter((t) => t.transaction_type === 'usage' && t.usage_kind === 'live_class')
  const liveAi = aiUsage.filter((r) => !r.refunded_at)

  // Schools that did anything in the last week: spent credits or used AI tools.
  const activeSchools = new Set<string>()
  for (const t of schoolTx) if (t.transaction_type === 'usage' && String(t.created_at) >= since7) activeSchools.add(t.organization_id)
  for (const r of aiUsage) if (String(r.created_at) >= since7) activeSchools.add(r.organization_id)

  const days = lastDays(30, now)
  const daily = new Map(days.map((date) => [date, { date, signups: 0, voiceMinutes: 0, revenue: 0 }]))
  for (const u of recentUsers) {
    const d = daily.get(String(u.created_at).slice(0, 10))
    if (d) d.signups += 1
  }
  for (const g of grants) {
    const d = daily.get(String(g.created_at).slice(0, 10))
    if (d) d.voiceMinutes += Number(g.minutes_charged) || 0
  }
  for (const p of purchases) {
    const d = daily.get(String(p.created_at).slice(0, 10))
    if (d) d.revenue += creditsToDollars(Number(p.credits) || 0)
  }

  const attention: AttentionItem[] = []
  for (const s of schools) {
    if (!s.is_active) {
      attention.push({ kind: 'suspended', title: `${s.name} is suspended`, detail: 'Its members can’t use the school until you reactivate it.', href: `/admin/schools/${s.id}` })
      continue
    }
    const balance = schoolBalance(s as never, now)
    const daysLeft = balance.trialActive && balance.trialExpiresAt ? Math.ceil((Date.parse(balance.trialExpiresAt) - now.getTime()) / 86_400_000) : null
    if (daysLeft !== null && daysLeft <= TRIAL_ENDING_DAYS) {
      attention.push({ kind: 'trial_ending', title: `${s.name}'s trial ends in ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}`, detail: `${balance.trial} trial credits left, ${balance.paid} bought.`, href: `/admin/schools/${s.id}` })
    } else if (!balance.trialActive && balance.total < LOW_BALANCE_CREDITS) {
      attention.push({ kind: 'low_credits', title: `${s.name} is low on credits`, detail: `${balance.total} credits left and no trial.`, href: `/admin/schools/${s.id}` })
    }
  }
  if (jobs.length) attention.push({ kind: 'failed_jobs', title: `${jobs.length} AI ${jobs.length === 1 ? 'job' : 'jobs'} failed this week`, detail: 'Lesson visuals, images or quizzes that didn’t generate.', href: '/admin/usage' })
  if (feedback.length) attention.push({ kind: 'poor_feedback', title: `${feedback.length} negative tutor ${feedback.length === 1 ? 'rating' : 'ratings'} in 30 days`, detail: 'Read what people said.', href: '/admin/feedback' })

  return {
    schools: {
      total: schools.length,
      active: schools.filter((s) => s.is_active).length,
      suspended: schools.filter((s) => !s.is_active).length,
      newThisMonth: schools.filter((s) => String(s.created_at) >= thisMonth).length,
      activeLast7Days: activeSchools.size,
    },
    users: { total: userTotal, students, teachers, learners, admins, newThisMonth: usersNewThisMonth, activeLast7Days: usersActive7 },
    revenue: {
      thisMonth: creditsToDollars(credits.thisMonth),
      lastMonth: creditsToDollars(credits.lastMonth),
      creditsSoldThisMonth: credits.thisMonth,
    },
    voiceMinutes: trend(grants, (r) => Number(r.minutes_charged) || 0),
    liveClassMinutes: trend(liveClass, usedCredits),
    visuals: (() => {
      const tutor = trend(visuals, () => 1)
      const authoring = trend(liveAi.filter((r) => r.category === 'interactive_generation'), (r) => Number(r.quantity) || 0)
      return { thisMonth: tutor.thisMonth + authoring.thisMonth, lastMonth: tutor.lastMonth + authoring.lastMonth }
    })(),
    images: trend(liveAi.filter((r) => r.category === 'image_generation'), (r) => Number(r.quantity) || 0),
    daily: [...daily.values()],
    attention,
  }
}

// ---------------------------------------------------------------- schools

const SCHOOL_COLUMNS = 'id, name, description, country, timezone, grade_levels, is_active, is_default_school, created_at, owner_id, credits, trial_credits, trial_expires_at, total_credits_purchased'

/** How far back "last activity" looks. */
export const ACTIVITY_WINDOW_DAYS = 90

async function schoolRows(supabase: Supabase, schools: Row[], now: Date): Promise<AdminSchoolRow[]> {
  const ids = schools.map((s) => s.id as string)
  const recent = new Date(now.getTime() - ACTIVITY_WINDOW_DAYS * 86_400_000).toISOString()
  const [members, lastTx, lastAi, owners] = await Promise.all([
    byIds(ids, (part) => supabase.from('organization_members').select('organization_id, role, is_active').in('organization_id', part).order('id')),
    byIds(ids, (part) => supabase.from('organization_credit_transactions').select('organization_id, created_at').in('organization_id', part).eq('transaction_type', 'usage').gte('created_at', recent).order('id')),
    byIds(ids, (part) => supabase.from('organization_ai_usage').select('organization_id, created_at').in('organization_id', part).gte('created_at', recent).order('id')),
    usersById(supabase, schools.map((s) => s.owner_id as string)),
  ])
  const last = new Map<string, string | null>()
  for (const r of [...lastTx, ...lastAi]) last.set(r.organization_id, later(last.get(r.organization_id) ?? null, r.created_at))
  return schools.map((s) => {
    const mine = members.filter((m) => m.organization_id === s.id && m.is_active)
    const balance = schoolBalance(s as never, now)
    return {
      id: s.id,
      name: s.name,
      country: s.country ?? null,
      isActive: Boolean(s.is_active),
      isDefault: Boolean(s.is_default_school),
      createdAt: s.created_at,
      owner: owners.get(s.owner_id) ?? null,
      students: mine.filter((m) => m.role === 'student').length,
      teachers: mine.filter((m) => m.role === 'teacher').length,
      admins: mine.filter((m) => m.role === 'owner' || m.role === 'admin').length,
      credits: { paid: balance.paid, trial: balance.trial, total: balance.total, trialExpiresAt: balance.trialExpiresAt, trialActive: balance.trialActive, low: balance.low },
      purchased: Number(s.total_credits_purchased) || 0,
      lastActivityAt: last.get(s.id) ?? null,
    }
  })
}

export async function listSchools(supabase: Supabase, now: Date = new Date()): Promise<AdminSchoolRow[]> {
  const schools = await every(() => supabase.from('organizations').select(SCHOOL_COLUMNS).eq('type', 'school').order('created_at', { ascending: false }).order('id'))
  return schoolRows(supabase, schools, now)
}

async function findSchool(supabase: Supabase, schoolId: string): Promise<Row> {
  if (!isUuid(schoolId)) throw new AdminError('School not found', 404)
  const { data, error } = await supabase.from('organizations').select(SCHOOL_COLUMNS).eq('type', 'school').eq('id', schoolId).maybeSingle()
  if (error) throw error
  if (!data) throw new AdminError('School not found', 404)
  return data
}

function ledgerRows(rows: Row[], names: Map<string, { name: string | null; email: string | null }>): AdminLedgerRow[] {
  return rows.map((t) => ({
    id: t.id,
    type: t.transaction_type,
    usageKind: t.usage_kind ?? null,
    credits: Number(t.credits) || 0,
    balanceAfter: t.balance_after ?? null,
    description: t.description ?? null,
    createdAt: t.created_at,
    by: t.user_id ? names.get(t.user_id)?.name ?? names.get(t.user_id)?.email ?? null : null,
  }))
}

export async function getSchoolDetail(supabase: Supabase, schoolId: string, now: Date = new Date()): Promise<AdminSchoolDetail> {
  const school = await findSchool(supabase, schoolId)
  const since = startOfMonth(now, 5).toISOString()
  const [[row], members, ledger, usageTx, aiUsage, lessons, activity] = await Promise.all([
    schoolRows(supabase, [school], now),
    every(() => supabase.from('organization_members').select('user_id, role, is_active').eq('organization_id', schoolId).order('id')),
    all(supabase.from('organization_credit_transactions').select('id, user_id, transaction_type, usage_kind, credits, balance_after, description, created_at').eq('organization_id', schoolId).neq('transaction_type', 'usage').order('created_at', { ascending: false }).limit(200)),
    every(() => supabase.from('organization_credit_transactions').select('usage_kind, credits, refunded_credits, created_at').eq('organization_id', schoolId).eq('transaction_type', 'usage').gte('created_at', since).order('id')),
    every(() => supabase.from('organization_ai_usage').select('category, quantity, refunded_at, created_at').eq('organization_id', schoolId).gte('created_at', since).order('id')),
    every(() => supabase.from('lessons').select('id, title, subject, created_at, current_publication_id, archived_at').eq('organization_id', schoolId).order('created_at', { ascending: false }).order('id')),
    listActivity(supabase, { targetId: schoolId, limit: 50 }),
  ])
  const people = await byIds(members.map((m) => m.user_id), (part) => supabase.from('users').select('id, name, email, lastlogin').in('id', part))
  const person = new Map(people.map((p) => [p.id as string, p]))
  const order: Record<string, number> = { owner: 0, admin: 1, teacher: 2, student: 3 }
  const memberRows: AdminMember[] = members
    .map((m) => ({
      userId: m.user_id,
      name: person.get(m.user_id)?.name ?? null,
      email: person.get(m.user_id)?.email ?? null,
      role: m.role,
      isActive: Boolean(m.is_active),
      lastLogin: person.get(m.user_id)?.lastlogin ?? null,
    }))
    .sort((a, b) => (order[a.role] ?? 9) - (order[b.role] ?? 9) || (a.name ?? a.email ?? '').localeCompare(b.name ?? b.email ?? ''))

  const months = new Map(lastMonths(6, now).map((month) => [month, { month, voice: 0, liveClass: 0, visuals: 0, images: 0 }]))
  for (const t of usageTx) {
    const m = months.get(monthKey(t.created_at))
    if (!m) continue
    if (t.usage_kind === 'voice') m.voice += usedCredits(t)
    else if (t.usage_kind === 'live_class') m.liveClass += usedCredits(t)
  }
  for (const r of aiUsage) {
    const m = months.get(monthKey(r.created_at))
    if (!m || r.refunded_at) continue
    if (r.category === 'interactive_generation') m.visuals += Number(r.quantity) || 0
    else if (r.category === 'image_generation') m.images += Number(r.quantity) || 0
  }

  const names = await usersById(supabase, ledger.map((t) => t.user_id))
  return {
    ...row,
    description: school.description ?? null,
    timezone: school.timezone ?? null,
    gradeLevels: school.grade_levels ?? [],
    members: memberRows,
    ledger: ledgerRows(ledger, names),
    usage: [...months.values()],
    lessons: {
      total: lessons.length,
      published: lessons.filter((l) => l.current_publication_id && !l.archived_at).length,
      recent: lessons.slice(0, 20).map((l) => ({ id: l.id, title: l.title, subject: l.subject ?? null, createdAt: l.created_at, published: Boolean(l.current_publication_id), archived: Boolean(l.archived_at) })),
    },
    activity,
  }
}

export async function grantSchoolCredits(context: PlatformAdminContext, schoolId: string, credits: number, reason: string) {
  const school = await findSchool(context.supabase, schoolId)
  const { data, error } = await context.supabase.rpc('add_school_credits', {
    p_organization_id: school.id,
    p_amount: credits,
    p_type: 'adjustment',
    p_description: `Given by InsyteAI: ${reason}`,
    p_user_id: context.adminId,
    p_payment_intent_id: null,
    p_usage_kind: null,
    p_reference_id: null,
  })
  if (error) throw error
  await logAdminAction(context, { action: 'school.grant_credits', targetType: 'school', targetId: school.id, targetLabel: school.name, details: { credits, reason } })
  return { balance: data as number | null }
}

export async function extendSchoolTrial(context: PlatformAdminContext, schoolId: string, days: number, reason: string, now: Date = new Date()) {
  const school = await findSchool(context.supabase, schoolId)
  const balance = schoolBalance(school as never, now)
  if (!balance.trialActive) throw new AdminError('This school’s trial has already ended. Give it credits instead.', 409)
  const from = Math.max(Date.parse(school.trial_expires_at), now.getTime())
  const until = new Date(from + days * 86_400_000).toISOString()
  const { error } = await context.supabase.from('organizations').update({ trial_expires_at: until }).eq('id', school.id)
  if (error) throw error
  await logAdminAction(context, { action: 'school.extend_trial', targetType: 'school', targetId: school.id, targetLabel: school.name, details: { days, reason, until } })
  return { trialExpiresAt: until }
}

export async function setSchoolActive(context: PlatformAdminContext, schoolId: string, active: boolean, reason: string) {
  const school = await findSchool(context.supabase, schoolId)
  if (Boolean(school.is_active) === active) throw new AdminError(active ? 'This school is already active.' : 'This school is already suspended.', 409)
  if (!active && school.is_default_school) throw new AdminError('The default school can’t be suspended: accounts without a school fall back to it.', 409)
  const { error } = await context.supabase.from('organizations').update({ is_active: active, updated_at: new Date().toISOString() }).eq('id', school.id)
  if (error) throw error
  await logAdminAction(context, { action: active ? 'school.reactivate' : 'school.suspend', targetType: 'school', targetId: school.id, targetLabel: school.name, details: { reason } })
}

/** Makes an active member of the school its owner; the old owner stays on as an administrator. */
export async function transferSchoolOwnership(context: PlatformAdminContext, schoolId: string, newOwnerId: string, reason: string) {
  const { supabase } = context
  const school = await findSchool(supabase, schoolId)
  if (!isUuid(newOwnerId)) throw new AdminError('Pick a member of this school', 400)
  if (newOwnerId === school.owner_id) throw new AdminError('That person already owns this school.', 409)
  const members = await all(supabase.from('organization_members').select('id, user_id, role, is_active').eq('organization_id', school.id).in('user_id', [newOwnerId, school.owner_id].filter(Boolean)))
  const next = members.find((m) => m.user_id === newOwnerId)
  if (!next || !next.is_active) throw new AdminError('Pick an active member of this school', 400)
  if (next.role === 'student') throw new AdminError('A student can’t own a school. Pick a teacher or administrator.', 400)
  const { data: user, error: userError } = await supabase.from('users').select('id, email, role').eq('id', newOwnerId).maybeSingle()
  if (userError) throw userError

  const previousOwnerId = (school.owner_id as string | null) ?? null
  const previous = members.find((m) => m.user_id === previousOwnerId)
  if (previous) {
    const { error } = await supabase.from('organization_members').update({ role: 'admin' }).eq('id', previous.id)
    if (error) throw error
  }
  const { error: memberError } = await supabase.from('organization_members').update({ role: 'owner' }).eq('id', next.id)
  if (memberError) throw memberError
  const { error: orgError } = await supabase.from('organizations').update({ owner_id: newOwnerId, updated_at: new Date().toISOString() }).eq('id', school.id)
  if (orgError) throw orgError
  // A teacher who becomes owner keeps teaching: their portal role is unchanged.
  await logAdminAction(context, {
    action: 'school.transfer_owner',
    targetType: 'school',
    targetId: school.id,
    targetLabel: school.name,
    details: { reason, newOwnerId, newOwnerEmail: user?.email ?? null, previousOwnerId },
  })
}

// ---------------------------------------------------------------- users

export const USER_PAGE_SIZE = 50

export async function searchUsers(
  supabase: Supabase,
  options: { query?: string | null; role?: string | null; page?: number },
): Promise<{ users: AdminUserRow[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, Math.floor(options.page ?? 1))
  let query = supabase.from('users').select('id, email, name, role, isactive, credits, lastlogin, created_at', { count: 'exact' })
  const text = options.query?.trim().replace(/[%_,()\\"*:]/g, ' ').replace(/\s+/g, ' ').trim()
  if (text) query = query.or(`email.ilike.%${text}%,name.ilike.%${text}%`)
  if (options.role && ['admin', 'teacher', 'student', 'learner'].includes(options.role)) query = query.eq('role', options.role)
  const from = (page - 1) * USER_PAGE_SIZE
  const { data, error, count } = await query.order('created_at', { ascending: false }).range(from, from + USER_PAGE_SIZE - 1)
  if (error) throw error
  const rows = (data ?? []) as Row[]
  const schools = await schoolsOf(supabase, rows.map((r) => r.id))
  return {
    users: rows.map((u) => toUserRow(u, schools.get(u.id) ?? null)),
    total: count ?? rows.length,
    page,
    pageSize: USER_PAGE_SIZE,
  }
}

function toUserRow(u: Row, school: AdminUserRow['school']): AdminUserRow {
  return {
    id: u.id,
    email: u.email ?? null,
    name: u.name ?? null,
    role: u.role ?? 'learner',
    isActive: u.isactive !== false,
    credits: Number(u.credits) || 0,
    lastLogin: u.lastlogin ?? null,
    createdAt: u.created_at,
    school,
  }
}

async function findUser(supabase: Supabase, userId: string): Promise<Row> {
  if (!isUuid(userId)) throw new AdminError('Account not found', 404)
  const { data, error } = await supabase.from('users').select('id, email, name, role, isactive, credits, total_credits_purchased, total_credits_used, lastlogin, created_at').eq('id', userId).maybeSingle()
  if (error) throw error
  if (!data) throw new AdminError('Account not found', 404)
  return data
}

export async function getUserDetail(supabase: Supabase, userId: string): Promise<AdminUserDetail> {
  const user = await findUser(supabase, userId)
  const [schools, ledger, sessions, feedback, activity] = await Promise.all([
    schoolsOf(supabase, [user.id]),
    all(supabase.from('credit_transactions').select('id, user_id, transaction_type, credits, description, created_at').eq('user_id', user.id).neq('transaction_type', 'usage').order('created_at', { ascending: false }).limit(100)),
    all(supabase.from('learning_sessions').select('id, topic, created_at, ended_at, is_embedded').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20)),
    listFeedback(supabase, { userId: user.id, limit: 20 }),
    listActivity(supabase, { targetId: user.id, limit: 50 }),
  ])
  return {
    ...toUserRow(user, schools.get(user.id) ?? null),
    purchased: Number(user.total_credits_purchased) || 0,
    used: Number(user.total_credits_used) || 0,
    ledger: ledgerRows(ledger.map((t) => ({ ...t, user_id: null })), new Map()),
    sessions: sessions.map((s) => ({ id: s.id, topic: s.topic ?? null, createdAt: s.created_at, endedAt: s.ended_at ?? null, embedded: Boolean(s.is_embedded) })),
    feedback,
    activity,
  }
}

export async function grantUserCredits(context: PlatformAdminContext, userId: string, credits: number, reason: string) {
  const user = await findUser(context.supabase, userId)
  const { data, error } = await context.supabase.rpc('add_user_credits', {
    p_user_id: user.id,
    p_amount: credits,
    p_description: `Given by InsyteAI: ${reason}`,
    p_type: 'bonus',
    p_payment_intent_id: null,
  })
  if (error) throw error
  await logAdminAction(context, { action: 'user.grant_credits', targetType: 'user', targetId: user.id, targetLabel: user.email, details: { credits, reason } })
  return { credits: data as number | null }
}

/** Blocks or restores sign-in. Their school membership and work stay. */
export async function setUserActive(context: PlatformAdminContext, userId: string, active: boolean, reason: string) {
  const { supabase } = context
  const user = await findUser(supabase, userId)
  if (user.id === context.adminId) throw new AdminError('You can’t deactivate your own account.', 409)
  if (user.role === 'admin' && !active) throw new AdminError('Remove their platform admin access first.', 409)
  if ((user.isactive !== false) === active) throw new AdminError(active ? 'This account is already active.' : 'This account is already deactivated.', 409)
  const { error: authError } = await supabase.auth.admin.updateUserById(user.id, { ban_duration: active ? 'none' : '876000h' })
  if (authError) throw authError
  const { error } = await supabase.from('users').update({ isactive: active }).eq('id', user.id)
  if (error) throw error
  await logAdminAction(context, { action: active ? 'user.reactivate' : 'user.deactivate', targetType: 'user', targetId: user.id, targetLabel: user.email, details: { reason } })
}

// ---------------------------------------------------------------- billing

export async function getBilling(supabase: Supabase, now: Date = new Date(), months = 12): Promise<BillingSummary> {
  const since = startOfMonth(now, months - 1).toISOString()
  const [personal, school] = await Promise.all([
    every(() => supabase.from('credit_transactions').select('id, user_id, transaction_type, credits, description, stripe_payment_intent_id, created_at').in('transaction_type', ['purchase', 'bonus', 'refund']).gte('created_at', since).order('created_at', { ascending: false }).order('id')),
    every(() => supabase.from('organization_credit_transactions').select('id, organization_id, transaction_type, credits, description, stripe_payment_intent_id, created_at').in('transaction_type', ['purchase', 'adjustment', 'trial']).gte('created_at', since).order('created_at', { ascending: false }).order('id')),
  ])
  const [people, orgs] = await Promise.all([
    usersById(supabase, personal.map((r) => r.user_id)),
    byIds(school.map((r) => r.organization_id), (part) => supabase.from('organizations').select('id, name').in('id', part)),
  ])
  const orgName = new Map(orgs.map((o) => [o.id as string, o.name as string]))
  const kindOf = (type: string): BillingRow['kind'] => (type === 'purchase' ? 'purchase' : type === 'trial' ? 'trial' : type === 'refund' ? 'refund' : 'grant')

  const rows: BillingRow[] = [
    ...personal.map((r) => {
      const kind = kindOf(r.transaction_type)
      const credits = Number(r.credits) || 0
      const who = people.get(r.user_id)
      return { id: r.id, at: r.created_at, kind, credits, dollars: kind === 'purchase' ? creditsToDollars(credits) : 0, payer: 'person' as const, name: who?.name || who?.email || 'Deleted account', href: `/admin/users/${r.user_id}`, description: r.description ?? null, stripePaymentIntent: r.stripe_payment_intent_id ?? null }
    }),
    ...school.map((r) => {
      const kind = kindOf(r.transaction_type)
      const credits = Number(r.credits) || 0
      return { id: r.id, at: r.created_at, kind, credits, dollars: kind === 'purchase' ? creditsToDollars(credits) : 0, payer: 'school' as const, name: orgName.get(r.organization_id) ?? 'Deleted school', href: `/admin/schools/${r.organization_id}`, description: r.description ?? null, stripePaymentIntent: r.stripe_payment_intent_id ?? null }
    }),
  ].sort((a, b) => b.at.localeCompare(a.at))

  const byMonth = new Map(lastMonths(months, now).map((month) => [month, { month, dollars: 0, credits: 0, schoolDollars: 0, personDollars: 0, granted: 0 }]))
  for (const r of rows) {
    const m = byMonth.get(monthKey(r.at))
    if (!m) continue
    if (r.kind === 'purchase') {
      m.dollars += r.dollars
      m.credits += r.credits
      if (r.payer === 'school') m.schoolDollars += r.dollars
      else m.personDollars += r.dollars
    } else if (r.kind === 'grant' || r.kind === 'trial') {
      m.granted += r.credits
    }
  }
  const monthsList = [...byMonth.values()]
  return {
    months: monthsList,
    totals: {
      dollars: monthsList.reduce((s, m) => s + m.dollars, 0),
      credits: monthsList.reduce((s, m) => s + m.credits, 0),
      granted: monthsList.reduce((s, m) => s + m.granted, 0),
      purchases: rows.filter((r) => r.kind === 'purchase').length,
    },
    rows: rows.slice(0, 500),
  }
}

// ---------------------------------------------------------------- AI usage

export async function getUsage(supabase: Supabase, days: number, now: Date = new Date()): Promise<UsageSummary> {
  const span = Math.max(1, Math.min(365, Math.floor(days)))
  const since = new Date(now.getTime() - span * 86_400_000).toISOString()
  const [grants, schoolTx, aiUsage, sessions, jobs] = await Promise.all([
    every(() => supabase.from('voice_session_grants').select('user_id, organization_id, minutes_charged, created_at').gte('created_at', since).order('id')),
    every(() => supabase.from('organization_credit_transactions').select('organization_id, usage_kind, credits, refunded_credits, created_at').eq('transaction_type', 'usage').eq('usage_kind', 'live_class').gte('created_at', since).order('id')),
    every(() => supabase.from('organization_ai_usage').select('organization_id, category, quantity, refunded_at, created_at').gte('created_at', since).order('id')),
    every(() => supabase.from('learning_sessions').select('id, user_id, is_embedded, created_at').gte('created_at', since).order('id')),
    every(() => supabase.from('content_jobs').select('id, job_type, status, error, created_at, completed_at, organization_id, lesson_id').gte('created_at', since).order('created_at', { ascending: false }).order('id')),
  ])
  const visuals = await byIds(sessions.map((s) => s.id), (part) => supabase.from('learning_visualizations').select('session_id, created_at').in('session_id', part).order('id'))

  const dayKeys = lastDays(span, now)
  const daily = new Map(dayKeys.map((date) => [date, { date, voice: 0, liveClass: 0, visuals: 0, images: 0 }]))
  const day = (at: string) => daily.get(String(at).slice(0, 10))

  // Per school: voice by the grant's school, else the person's school today.
  const personSchool = await schoolsOf(supabase, [...grants.map((g) => g.user_id), ...sessions.map((s) => s.user_id)])
  const sessionUser = new Map(sessions.map((s) => [s.id as string, s.user_id as string]))
  const perSchool = new Map<string, { voice: number; liveClass: number; visuals: number; images: number }>()
  const bucket = (id: string | null | undefined) => {
    if (!id) return null
    let b = perSchool.get(id)
    if (!b) perSchool.set(id, (b = { voice: 0, liveClass: 0, visuals: 0, images: 0 }))
    return b
  }

  const totals = { voice: 0, liveClass: 0, visuals: 0, images: 0, sessions: sessions.length, embedSessions: sessions.filter((s) => s.is_embedded).length }
  for (const g of grants) {
    const minutes = Number(g.minutes_charged) || 0
    totals.voice += minutes
    const d = day(g.created_at)
    if (d) d.voice += minutes
    const b = bucket(g.organization_id ?? personSchool.get(g.user_id)?.id)
    if (b) b.voice += minutes
  }
  for (const t of schoolTx) {
    const minutes = usedCredits(t)
    totals.liveClass += minutes
    const d = day(t.created_at)
    if (d) d.liveClass += minutes
    const b = bucket(t.organization_id)
    if (b) b.liveClass += minutes
  }
  for (const r of aiUsage) {
    if (r.refunded_at) continue
    const q = Number(r.quantity) || 0
    const key = r.category === 'interactive_generation' ? 'visuals' : r.category === 'image_generation' ? 'images' : null
    if (!key) continue
    totals[key] += q
    const d = day(r.created_at)
    if (d) d[key] += q
    const b = bucket(r.organization_id)
    if (b) b[key] += q
  }
  for (const v of visuals) {
    totals.visuals += 1
    const d = day(v.created_at)
    if (d) d.visuals += 1
    const b = bucket(personSchool.get(sessionUser.get(v.session_id) ?? '')?.id)
    if (b) b.visuals += 1
  }

  const schoolIds = [...new Set([...perSchool.keys(), ...jobs.map((j) => j.organization_id).filter(Boolean)])]
  const orgs = await byIds(schoolIds, (part) => supabase.from('organizations').select('id, name').in('id', part))
  const orgName = new Map(orgs.map((o) => [o.id as string, o.name as string]))
  const topSchools = [...perSchool.entries()]
    .map(([id, b]) => ({ id, name: orgName.get(id) ?? 'Unknown school', ...b }))
    .sort((a, b) => b.voice + b.liveClass + b.visuals + b.images - (a.voice + a.liveClass + a.visuals + a.images))
    .slice(0, 10)

  const failed = jobs.filter((j) => j.status === 'failed')
  return {
    days: [...daily.values()],
    totals,
    topSchools,
    jobs: {
      succeeded: jobs.filter((j) => j.status === 'succeeded').length,
      failed: failed.length,
      pending: jobs.filter((j) => j.status === 'queued' || j.status === 'running').length,
      failures: failed.slice(0, 50).map((j) => ({ id: j.id, type: j.job_type, error: j.error ?? null, at: j.completed_at ?? j.created_at, schoolId: j.organization_id ?? null, schoolName: j.organization_id ? orgName.get(j.organization_id) ?? null : null, lessonId: j.lesson_id ?? null })),
    },
  }
}

// ---------------------------------------------------------------- feedback and activity

export async function listFeedback(supabase: Supabase, options: { rating?: string | null; userId?: string; limit?: number } = {}): Promise<FeedbackRow[]> {
  let query = supabase.from('feedback').select('id, user_id, rating, experience, improvements, would_recommend, trigger_type, error_message, session_duration_seconds, created_at')
  if (options.rating && ['positive', 'neutral', 'negative'].includes(options.rating)) query = query.eq('rating', options.rating)
  if (options.userId) query = query.eq('user_id', options.userId)
  const rows = await all(query.order('created_at', { ascending: false }).limit(options.limit ?? 200))
  const users = await usersById(supabase, rows.map((r) => r.user_id))
  return rows.map((r) => ({
    id: r.id,
    rating: r.rating ?? null,
    experience: r.experience ?? null,
    improvements: r.improvements ?? null,
    wouldRecommend: r.would_recommend ?? null,
    trigger: r.trigger_type ?? null,
    error: r.error_message ?? null,
    durationSeconds: r.session_duration_seconds ?? null,
    createdAt: r.created_at,
    user: r.user_id ? users.get(r.user_id) ?? null : null,
  }))
}

export async function listActivity(supabase: Supabase, options: { targetId?: string; limit?: number } = {}): Promise<ActivityRow[]> {
  let query = supabase.from('platform_admin_actions').select('id, admin_id, action, target_type, target_id, target_label, details, created_at')
  if (options.targetId) query = query.eq('target_id', options.targetId)
  const { data, error } = await query.order('created_at', { ascending: false }).limit(options.limit ?? 200)
  if (error) {
    // Before the activity table exists, show an empty log instead of failing the page.
    if ((error as { code?: string }).code === '42P01') return []
    throw error
  }
  const rows = (data ?? []) as Row[]
  const admins = await usersById(supabase, rows.map((r) => r.admin_id))
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    targetType: r.target_type,
    targetId: r.target_id ?? null,
    targetLabel: r.target_label ?? null,
    details: (r.details ?? {}) as Record<string, unknown>,
    createdAt: r.created_at,
    admin: r.admin_id ? admins.get(r.admin_id) ?? null : null,
  }))
}
