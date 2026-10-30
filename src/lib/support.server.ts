import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createServerSupabase } from '@/lib/supabase.server'
import { sendEmail, sendEmails } from '@/lib/email'
import {
  DAILY_MESSAGE_LIMIT,
  DAILY_REQUEST_LIMIT,
  buildReplyEmail,
  buildStaffAlertEmail,
  helpPath,
  isSupportCategory,
  isSupportStatus,
  preview,
  type AdminSupportDetail,
  type AdminSupportRow,
  type SupportCategory,
  type SupportMessage,
  type SupportPerson,
  type SupportPortal,
  type SupportRequestDetail,
  type SupportRequestRow,
  type SupportStatus,
  type SupportSummary,
} from '@/lib/support'

type Supabase = ReturnType<typeof createServerSupabase>
type Row = Record<string, any>

export type SupportUser = { id: string; email: string; name: string | null; role: string | null }

/** A problem to show the person, with the status to answer with. */
export class SupportError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

export function supportErrorResponse(error: unknown, fallback: string, where: string) {
  if (error instanceof SupportError) return NextResponse.json({ error: error.message }, { status: error.status })
  console.error(`Error in ${where}:`, error)
  return NextResponse.json({ error: fallback }, { status: 500 })
}

/** Anyone signed in with a session (API keys can't use support). */
export async function requireSupportUser(): Promise<{ ok: true; user: SupportUser; supabase: Supabase } | { ok: false; response: NextResponse }> {
  const session = await getServerSession()
  if (!session?.user) return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  return { ok: true, user: session.user, supabase: createServerSupabase() }
}

const REQUEST_FIELDS = 'id, user_id, school_id, portal, category, subject, page_path, user_agent, status, staff_unread, user_unread, created_at, last_message_at'

async function must<T = Row[]>(query: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
  const { data, error } = await query
  if (error) throw error
  return data as T
}

const dayAgo = () => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

async function countSince(supabase: Supabase, table: 'support_requests' | 'support_messages', column: 'user_id' | 'author_id', userId: string) {
  const { count, error } = await supabase.from(table).select('id', { count: 'exact', head: true }).eq(column, userId).gte('created_at', dayAgo())
  if (error) throw error
  return count ?? 0
}

/** The person's school, even while suspended (they may be writing about that). */
async function schoolOf(supabase: Supabase, userId: string): Promise<{ id: string; name: string } | null> {
  const { data, error } = await supabase
    .from('organization_members')
    .select('organizations!inner(id, name, type)')
    .eq('user_id', userId)
    .eq('is_active', true)
    .eq('organizations.type', 'school')
    .order('joined_at')
    .limit(1)
    .maybeSingle()
  if (error) throw error
  const org = (Array.isArray(data?.organizations) ? data?.organizations[0] : data?.organizations) as Row | undefined
  return org ? { id: org.id as string, name: org.name as string } : null
}

const PAGE = 1000

async function messagesFor(supabase: Supabase, requestIds: string[]): Promise<Row[]> {
  if (requestIds.length === 0) return []
  const out: Row[] = []
  for (let i = 0; i < requestIds.length; i += 200) {
    const part = requestIds.slice(i, i + 200)
    // The API returns at most 1,000 rows per call, so page until every message is read.
    for (let from = 0; ; from += PAGE) {
      const page = await must(
        supabase.from('support_messages').select('id, request_id, author_id, from_staff, body, created_at').in('request_id', part)
          .order('created_at').order('id').range(from, from + PAGE - 1),
      )
      out.push(...page)
      if (page.length < PAGE) break
    }
  }
  return out
}

async function peopleById(supabase: Supabase, ids: Array<string | null | undefined>): Promise<Map<string, SupportPerson>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))]
  const out = new Map<string, SupportPerson>()
  for (let i = 0; i < unique.length; i += 200) {
    const rows = await must(supabase.from('users').select('id, name, email, role').in('id', unique.slice(i, i + 200)))
    for (const u of rows) out.set(u.id, { id: u.id, name: u.name ?? null, email: u.email ?? null, role: u.role ?? null })
  }
  return out
}

function toRow(r: Row, messages: Row[], unread: boolean): SupportRequestRow {
  const last = messages[messages.length - 1]
  return {
    id: r.id,
    category: (isSupportCategory(r.category) ? r.category : 'other') as SupportCategory,
    subject: r.subject,
    status: (isSupportStatus(r.status) ? r.status : 'open') as SupportStatus,
    unread,
    createdAt: r.created_at,
    lastMessageAt: r.last_message_at,
    preview: preview(last?.body),
    messageCount: messages.length,
  }
}

function groupMessages(messages: Row[]) {
  const map = new Map<string, Row[]>()
  for (const m of messages) {
    const list = map.get(m.request_id) ?? []
    list.push(m)
    map.set(m.request_id, list)
  }
  return map
}

// ---- Alerts ----

/** Who hears about new requests: SUPPORT_NOTIFY_EMAIL (comma-separated) or every active platform admin. */
async function staffRecipients(supabase: Supabase): Promise<string[]> {
  const configured = (process.env.SUPPORT_NOTIFY_EMAIL ?? '').split(',').map((e) => e.trim()).filter((e) => /^[^\s@]+@[^\s@]+$/.test(e))
  if (configured.length) return [...new Set(configured)]
  const rows = await must(supabase.from('users').select('email').eq('role', 'admin').eq('isactive', true).limit(50))
  return [...new Set(rows.map((r) => r.email as string).filter(Boolean))]
}

/** Emails support about a new request or follow-up. Never throws. */
export async function alertStaff(
  supabase: Supabase,
  origin: string,
  input: { requestId: string; kind: 'new' | 'follow_up'; category: string; subject: string; message: string; user: SupportUser; schoolName: string | null },
) {
  try {
    const to = await staffRecipients(supabase)
    if (to.length === 0) return
    const email = buildStaffAlertEmail({
      kind: input.kind,
      category: input.category,
      subject: input.subject,
      message: input.message,
      from: { name: input.user.name, email: input.user.email, role: input.user.role },
      schoolName: input.schoolName,
      url: `${origin}/admin/support/${input.requestId}`,
    })
    await sendEmails(to.map((address) => ({ to: address, ...email })))
  } catch (error) {
    console.error('Could not email support about a request:', error)
  }
}

// ---- The person's side ----

export async function createSupportRequest(
  supabase: Supabase,
  user: SupportUser,
  input: { category: SupportCategory; subject: string; message: string; pagePath: string | null; portal: SupportPortal; userAgent: string | null },
) {
  const [requests, messages] = await Promise.all([
    countSince(supabase, 'support_requests', 'user_id', user.id),
    countSince(supabase, 'support_messages', 'author_id', user.id),
  ])
  if (requests >= DAILY_REQUEST_LIMIT || messages >= DAILY_MESSAGE_LIMIT) {
    throw new SupportError('You’ve sent a lot of messages today. Please add to one of your open requests or try again tomorrow.', 429)
  }
  const school = await schoolOf(supabase, user.id)
  const request = await must<Row>(
    supabase
      .from('support_requests')
      .insert({
        user_id: user.id,
        school_id: school?.id ?? null,
        portal: input.portal,
        category: input.category,
        subject: input.subject,
        page_path: input.pagePath,
        user_agent: input.userAgent?.slice(0, 400) || null,
      })
      .select('id')
      .single(),
  )
  const { error } = await supabase.from('support_messages').insert({ request_id: request.id, author_id: user.id, from_staff: false, body: input.message })
  if (error) {
    await supabase.from('support_requests').delete().eq('id', request.id)
    throw error
  }
  return { id: request.id as string, schoolName: school?.name ?? null }
}

export async function listMyRequests(supabase: Supabase, userId: string): Promise<SupportRequestRow[]> {
  const rows = await must(supabase.from('support_requests').select(REQUEST_FIELDS).eq('user_id', userId).order('last_message_at', { ascending: false }).limit(100))
  const byRequest = groupMessages(await messagesFor(supabase, rows.map((r) => r.id)))
  return rows.map((r) => toRow(r, byRequest.get(r.id) ?? [], Boolean(r.user_unread)))
}

async function ownRequest(supabase: Supabase, userId: string, requestId: string): Promise<Row> {
  const row = await must<Row | null>(supabase.from('support_requests').select(REQUEST_FIELDS).eq('id', requestId).eq('user_id', userId).maybeSingle())
  if (!row) throw new SupportError('Request not found', 404)
  return row
}

function detail(r: Row, messages: Row[], unread: boolean, authors?: Map<string, SupportPerson>): SupportRequestDetail {
  return {
    ...toRow(r, messages, unread),
    portal: r.portal === 'school' ? 'school' : 'help',
    pagePath: r.page_path ?? null,
    messages: messages.map<SupportMessage>((m) => ({
      id: m.id,
      body: m.body,
      fromStaff: Boolean(m.from_staff),
      createdAt: m.created_at,
      // People see "InsyteAI team", not which staff member answered.
      author: authors && m.author_id ? authors.get(m.author_id) ?? null : null,
    })),
  }
}

/** The person's request with every message; opening it marks replies read. */
export async function getMyRequest(supabase: Supabase, userId: string, requestId: string): Promise<SupportRequestDetail> {
  const row = await ownRequest(supabase, userId, requestId)
  const messages = await messagesFor(supabase, [row.id])
  if (row.user_unread) {
    // Only if nothing newer arrived since we read it, so a reply sent meanwhile stays unread.
    const { error } = await supabase.from('support_requests').update({ user_unread: false }).eq('id', row.id).eq('last_message_at', row.last_message_at)
    if (error) console.error('Could not mark support reply read:', error)
  }
  return detail(row, messages, false)
}

/** A follow-up from the person. Reopens a resolved request. */
export async function addMyMessage(supabase: Supabase, user: SupportUser, requestId: string, body: string) {
  const row = await ownRequest(supabase, user.id, requestId)
  if ((await countSince(supabase, 'support_messages', 'author_id', user.id)) >= DAILY_MESSAGE_LIMIT) {
    throw new SupportError('You’ve sent a lot of messages today. Please try again tomorrow.', 429)
  }
  const now = new Date().toISOString()
  const { error } = await supabase.from('support_messages').insert({ request_id: row.id, author_id: user.id, from_staff: false, body })
  if (error) throw error
  const { error: updateError } = await supabase
    .from('support_requests')
    .update({ staff_unread: true, user_unread: false, last_message_at: now, updated_at: now, ...(row.status === 'resolved' ? { status: 'open' } : {}) })
    .eq('id', row.id)
  if (updateError) throw updateError
  const school = row.school_id ? await must<Row | null>(supabase.from('organizations').select('name').eq('id', row.school_id).maybeSingle()) : null
  return { category: row.category as string, subject: row.subject as string, schoolName: (school?.name as string | undefined) ?? null }
}

/** Replies the person hasn't read yet (for the account menu). */
export async function myUnreadCount(supabase: Supabase, userId: string): Promise<number> {
  const { count, error } = await supabase.from('support_requests').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('user_unread', true)
  if (error) throw error
  return count ?? 0
}

// ---- Support staff's side ----

export async function supportSummary(supabase: Supabase): Promise<SupportSummary> {
  const count = async (build: (q: any) => any) => {
    const { count, error } = await build(supabase.from('support_requests').select('id', { count: 'exact', head: true }))
    if (error) throw error
    return count ?? 0
  }
  const [unread, open, inProgress] = await Promise.all([
    count((q) => q.eq('staff_unread', true)),
    count((q) => q.eq('status', 'open')),
    count((q) => q.eq('status', 'in_progress')),
  ])
  return { unread, open, inProgress }
}

/** Every request, newest activity first. status: a status, 'active' (not resolved) or empty for all. */
export async function listSupportRequests(
  supabase: Supabase,
  filters: { status?: string | null; category?: string | null; userId?: string | null; limit?: number } = {},
): Promise<AdminSupportRow[]> {
  let query = supabase.from('support_requests').select(REQUEST_FIELDS)
  if (filters.status === 'active') query = query.neq('status', 'resolved')
  else if (isSupportStatus(filters.status)) query = query.eq('status', filters.status)
  if (isSupportCategory(filters.category)) query = query.eq('category', filters.category)
  if (filters.userId) query = query.eq('user_id', filters.userId)
  const rows = await must(query.order('last_message_at', { ascending: false }).limit(filters.limit ?? 200))
  const [messages, people, schools] = await Promise.all([
    messagesFor(supabase, rows.map((r) => r.id)),
    peopleById(supabase, rows.map((r) => r.user_id)),
    schoolNames(supabase, rows.map((r) => r.school_id)),
  ])
  const byRequest = groupMessages(messages)
  return rows.map((r) => ({
    ...toRow(r, byRequest.get(r.id) ?? [], Boolean(r.staff_unread)),
    user: r.user_id ? people.get(r.user_id) ?? null : null,
    schoolName: r.school_id ? schools.get(r.school_id) ?? null : null,
  }))
}

async function schoolNames(supabase: Supabase, ids: Array<string | null>) {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))]
  if (unique.length === 0) return new Map<string, string>()
  const rows = await must(supabase.from('organizations').select('id, name').in('id', unique))
  return new Map(rows.map((r) => [r.id as string, r.name as string]))
}

async function anyRequest(supabase: Supabase, requestId: string): Promise<Row> {
  const row = await must<Row | null>(supabase.from('support_requests').select(REQUEST_FIELDS).eq('id', requestId).maybeSingle())
  if (!row) throw new SupportError('Request not found', 404)
  return row
}

/** One request for support staff; opening it marks it read. */
export async function getSupportRequest(supabase: Supabase, requestId: string): Promise<AdminSupportDetail> {
  const row = await anyRequest(supabase, requestId)
  const messages = await messagesFor(supabase, [row.id])
  const [people, schools] = await Promise.all([
    peopleById(supabase, [row.user_id, ...messages.map((m) => m.author_id)]),
    schoolNames(supabase, [row.school_id]),
  ])
  if (row.staff_unread) {
    // Only if nothing newer arrived since we read it, so a follow-up sent meanwhile stays unread.
    const { error } = await supabase.from('support_requests').update({ staff_unread: false }).eq('id', row.id).eq('last_message_at', row.last_message_at)
    if (error) console.error('Could not mark support request read:', error)
  }
  return {
    ...detail(row, messages, false, people),
    user: row.user_id ? people.get(row.user_id) ?? null : null,
    school: row.school_id && schools.get(row.school_id) ? { id: row.school_id, name: schools.get(row.school_id)! } : null,
    userAgent: row.user_agent ?? null,
  }
}

/**
 * Support's reply and/or a status change. A reply without a status moves an
 * open request to In progress. The person gets an email with the reply.
 */
export async function answerSupportRequest(
  supabase: Supabase,
  adminId: string,
  requestId: string,
  input: { message: string | null; status: SupportStatus | null },
  origin: string,
) {
  const row = await anyRequest(supabase, requestId)
  const now = new Date().toISOString()
  const status: SupportStatus = input.status ?? (input.message && row.status === 'open' ? 'in_progress' : (row.status as SupportStatus))
  if (input.message) {
    const { error } = await supabase.from('support_messages').insert({ request_id: row.id, author_id: adminId, from_staff: true, body: input.message })
    if (error) throw error
  }
  const { error } = await supabase
    .from('support_requests')
    .update({
      status,
      updated_at: now,
      ...(input.message ? { user_unread: true, last_message_at: now } : {}),
    })
    .eq('id', row.id)
  if (error) throw error
  // Support has seen everything up to what they answered, unless a follow-up arrived meanwhile.
  const { error: readError } = await supabase
    .from('support_requests')
    .update({ staff_unread: false })
    .eq('id', row.id)
    .eq('last_message_at', input.message ? now : row.last_message_at)
  if (readError) console.error('Could not mark support request read:', readError)

  let emailed: 'sent' | 'not_configured' | 'failed' | 'no_email' | null = null
  if (input.message) {
    const person = row.user_id ? (await peopleById(supabase, [row.user_id])).get(row.user_id) : null
    if (!person?.email) emailed = 'no_email'
    else {
      const email = buildReplyEmail({
        name: person.name,
        subject: row.subject,
        reply: input.message,
        status,
        url: `${origin}${helpPath(row.portal)}?request=${row.id}`,
      })
      const result = await sendEmail({ to: person.email, ...email })
      emailed = result.sent ? 'sent' : result.reason
    }
  }
  return { status, emailed }
}
