/** Help & feedback: what people send to the InsyteAI team, and support's replies. */

export const SUPPORT_CATEGORIES = [
  { value: 'problem', label: 'Something isn’t working', short: 'Problem' },
  { value: 'feature', label: 'Feature request', short: 'Feature request' },
  { value: 'complaint', label: 'Complaint', short: 'Complaint' },
  { value: 'billing', label: 'Billing or credits', short: 'Billing' },
  { value: 'account', label: 'Account or sign-in help', short: 'Account' },
  { value: 'other', label: 'Something else', short: 'Other' },
] as const

export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number]['value']

export const SUPPORT_STATUSES = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'resolved', label: 'Resolved' },
] as const

export type SupportStatus = (typeof SUPPORT_STATUSES)[number]['value']
export type SupportPortal = 'help' | 'school'

/** Browser events: the person read a reply / support opened or answered a request. Badges refresh on them. */
export const SUPPORT_READ_EVENT = 'insyte:support-read'
export const SUPPORT_STATUS_EVENT = 'insyte:support-status'

export const MAX_SUBJECT = 150
export const MAX_MESSAGE = 5000
/** New requests one person can send in 24 hours. */
export const DAILY_REQUEST_LIMIT = 10
/** Messages (new requests and follow-ups) one person can send in 24 hours. */
export const DAILY_MESSAGE_LIMIT = 40

export const categoryLabel = (value: string) => SUPPORT_CATEGORIES.find((c) => c.value === value)?.short ?? 'Other'
export const statusLabel = (value: string) => SUPPORT_STATUSES.find((s) => s.value === value)?.label ?? value
export const isSupportCategory = (value: unknown): value is SupportCategory =>
  typeof value === 'string' && SUPPORT_CATEGORIES.some((c) => c.value === value)
export const isSupportStatus = (value: unknown): value is SupportStatus =>
  typeof value === 'string' && SUPPORT_STATUSES.some((s) => s.value === value)

/** Where a person reads their requests: the school portal or the general help page. */
export const helpPath = (portal: string | null | undefined) => (portal === 'school' ? '/school/help' : '/help')

export type SupportPerson = { id: string; name: string | null; email: string | null; role?: string | null }

export type SupportRequestRow = {
  id: string
  category: SupportCategory
  subject: string
  status: SupportStatus
  /** Has a message the viewer hasn't read (a reply for the person, a new message for support). */
  unread: boolean
  createdAt: string
  lastMessageAt: string
  /** Start of the latest message, for the list. */
  preview: string | null
  messageCount: number
}

export type AdminSupportRow = SupportRequestRow & {
  user: SupportPerson | null
  schoolName: string | null
}

export type SupportMessage = {
  id: string
  body: string
  fromStaff: boolean
  createdAt: string
  /** The support person who replied (shown to staff only). */
  author: SupportPerson | null
}

export type SupportRequestDetail = SupportRequestRow & {
  portal: SupportPortal
  pagePath: string | null
  messages: SupportMessage[]
}

export type AdminSupportDetail = SupportRequestDetail & {
  user: SupportPerson | null
  school: { id: string; name: string } | null
  userAgent: string | null
}

export type SupportSummary = { unread: number; open: number; inProgress: number }

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

const clean = (value: unknown) => (typeof value === 'string' ? value.replace(/\r\n/g, '\n').trim() : '')

/** Keeps only an in-app path like "/students/homework/123" (no other sites, at most 300 characters). */
export function cleanPagePath(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const path = value.trim()
  if (!path.startsWith('/') || path.startsWith('//') || /[\\\u0000-\u001f\s]/.test(path)) return null
  return path.slice(0, 300)
}

export function parseNewRequest(body: unknown): Parsed<{ category: SupportCategory; subject: string; message: string; pagePath: string | null; portal: SupportPortal }> {
  const input = (body ?? {}) as Record<string, unknown>
  if (!isSupportCategory(input.category)) return { ok: false, error: 'Choose what your message is about.' }
  const subject = clean(input.subject).replace(/\s+/g, ' ')
  if (!subject) return { ok: false, error: 'Add a short subject.' }
  if (subject.length > MAX_SUBJECT) return { ok: false, error: `Keep the subject under ${MAX_SUBJECT} characters.` }
  const message = clean(input.message)
  if (!message) return { ok: false, error: 'Tell us what happened or what you need.' }
  if (message.length > MAX_MESSAGE) return { ok: false, error: `Keep the message under ${MAX_MESSAGE.toLocaleString()} characters.` }
  return {
    ok: true,
    value: { category: input.category, subject, message, pagePath: cleanPagePath(input.pagePath), portal: input.portal === 'school' ? 'school' : 'help' },
  }
}

export function parseMessage(value: unknown): Parsed<string> {
  const message = clean(value)
  if (!message) return { ok: false, error: 'Write a message first.' }
  if (message.length > MAX_MESSAGE) return { ok: false, error: `Keep the message under ${MAX_MESSAGE.toLocaleString()} characters.` }
  return { ok: true, value: message }
}

export const preview = (body: string | null | undefined, length = 140) => {
  if (!body) return null
  const flat = body.replace(/\s+/g, ' ').trim()
  return flat.length > length ? `${flat.slice(0, length - 1)}…` : flat
}

// ---- Emails ----

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] as string)

/** Keeps line breaks from a message in the HTML version. */
const paragraphHtml = (text: string) => escapeHtml(text).replace(/\n/g, '<br>')

function layout(lines: string[], button: { label: string; url: string }) {
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;padding:32px" cellspacing="0" cellpadding="0"><tr><td>
${lines.join('\n')}
<p style="margin:24px 0 0"><a href="${escapeHtml(button.url)}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">${escapeHtml(button.label)}</a></p>
</td></tr></table>
</td></tr></table>
</body></html>`
}

const quote = (text: string) =>
  `<div style="margin:0 0 16px;padding:12px 16px;border-left:3px solid #c7d2fe;background:#f8fafc;font-size:15px;line-height:1.55">${paragraphHtml(text)}</div>`

/** Tells support staff about a new request or a follow-up. */
export function buildStaffAlertEmail(input: {
  kind: 'new' | 'follow_up'
  category: string
  subject: string
  message: string
  from: { name: string | null; email: string | null; role: string | null }
  schoolName: string | null
  url: string
}) {
  const who = input.from.name || input.from.email || 'Someone'
  const detailParts = [input.from.email && input.from.name ? input.from.email : null, input.from.role, input.schoolName].filter(Boolean) as string[]
  const heading = input.kind === 'new' ? `New ${categoryLabel(input.category).toLowerCase()} from ${who}` : `${who} replied`
  const subject = input.kind === 'new'
    ? `[Support] ${categoryLabel(input.category)}: ${input.subject}`
    : `[Support] Re: ${input.subject}`
  const text = [
    heading,
    detailParts.join(' · '),
    '',
    `Subject: ${input.subject}`,
    '',
    input.message,
    '',
    `Open in the admin portal: ${input.url}`,
  ].join('\n')
  const html = layout(
    [
      `<p style="margin:0 0 4px;font-size:17px;font-weight:600">${escapeHtml(heading)}</p>`,
      detailParts.length ? `<p style="margin:0 0 16px;font-size:13px;color:#6b7280">${escapeHtml(detailParts.join(' · '))}</p>` : '',
      `<p style="margin:0 0 8px;font-size:15px"><strong>${escapeHtml(input.subject)}</strong></p>`,
      quote(input.message),
    ],
    { label: 'Open in Support inbox', url: input.url },
  )
  return { subject, text, html }
}

/** Tells the person that support replied. */
export function buildReplyEmail(input: { name: string | null; subject: string; reply: string; status: SupportStatus; url: string }) {
  const greeting = input.name ? `Hi ${input.name},` : 'Hi,'
  const resolved = input.status === 'resolved'
    ? 'We’ve marked this request as resolved. If you still need help, reply from the link below and it will reopen.'
    : 'You can reply from the link below.'
  const subject = `Re: ${input.subject}`
  const text = [greeting, '', `The InsyteAI team replied to your request “${input.subject}”:`, '', input.reply, '', resolved, '', `View the conversation: ${input.url}`].join('\n')
  const html = layout(
    [
      `<p style="margin:0 0 16px;font-size:16px">${escapeHtml(greeting)}</p>`,
      `<p style="margin:0 0 12px;font-size:15px;line-height:1.5">The InsyteAI team replied to your request <strong>${escapeHtml(input.subject)}</strong>:</p>`,
      quote(input.reply),
      `<p style="margin:0;font-size:13px;color:#6b7280">${escapeHtml(resolved)}</p>`,
    ],
    { label: 'View the conversation', url: input.url },
  )
  return { subject, text, html }
}

/** Support email shown on public pages, when set. */
export function publicSupportEmail(): string | null {
  const value = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim()
  return value && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value) ? value : null
}
