import { createHash, randomBytes, randomInt } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { sendEmails, isEmailConfigured, type EmailMessage } from '@/lib/email'
import { buildInviteEmail } from '@/lib/school-invite-email'
import type { SchoolRecord, ServiceSupabase } from '@/lib/school-access.server'
import { schoolHasPurchasedCredits } from '@/lib/school-access.server'
import {
  INVITES_BEFORE_FIRST_PURCHASE,
  INVITE_TTL_DAYS,
  JOIN_CODE_ALPHABET,
  JOIN_CODE_LENGTH,
  type Invite,
} from '@/lib/school-invites'

export function generateInviteToken(): string {
  return randomBytes(32).toString('base64url')
}

/** Matches encode(sha256(convert_to(token, 'UTF8')), 'hex') in accept_school_invite(). */
export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export function generateJoinCode(length = JOIN_CODE_LENGTH): string {
  let code = ''
  for (let i = 0; i < length; i++) code += JOIN_CODE_ALPHABET[randomInt(JOIN_CODE_ALPHABET.length)]
  return code
}

/** Base URL for links in emails: APP_URL when set, otherwise the request's own origin. */
export function appOrigin(request: NextRequest): string {
  const configured = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL
  return (configured || request.nextUrl.origin).replace(/\/+$/, '')
}

export const inviteLink = (origin: string, token: string) => `${origin}/join/${encodeURIComponent(token)}`

export const inviteExpiry = (from = new Date()) => new Date(from.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000)

export type InviteOutcome = {
  email: string
  outcome: 'invited' | 'skipped' | 'failed'
  emailed: boolean
  message?: string
  inviteUrl?: string
}

type SendContext = {
  supabase: ServiceSupabase
  school: Pick<SchoolRecord, 'id' | 'name' | 'owner_id' | 'total_credits_purchased'>
  inviter: { id: string; name: string | null }
  origin: string
}

const chunk = <T,>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size))

/** Invites that count toward the limit before a first purchase: everything sent except cancelled ones. */
async function countCountedInvites(supabase: ServiceSupabase, schoolId: string) {
  const { count, error } = await supabase
    .from('organization_invitations')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', schoolId)
    .is('revoked_at', null)
  if (error) throw error
  return count ?? 0
}

export class InviteLimitError extends Error {}

/**
 * Creates (or refreshes) invites and emails them. People already in the school
 * are skipped. An open invite for the same email is replaced with a fresh link
 * and the new role and grade.
 */
export async function createSchoolInvites(context: SendContext, invites: Invite[]): Promise<InviteOutcome[]> {
  const { supabase, school, inviter, origin } = context
  const emails = invites.map((invite) => invite.email)

  // Who is already an active member of this school?
  const memberEmails = new Set<string>()
  for (const part of chunk(emails, 100)) {
    const { data: users, error } = await supabase.from('users').select('id, email').in('email', part)
    if (error) throw error
    const ids = (users ?? []).map((u) => u.id as string)
    if (ids.length === 0) continue
    const { data: members, error: membersError } = await supabase
      .from('organization_members')
      .select('user_id')
      .eq('organization_id', school.id)
      .eq('is_active', true)
      .in('user_id', ids)
    if (membersError) throw membersError
    const memberIds = new Set((members ?? []).map((m) => m.user_id as string))
    for (const user of users ?? []) {
      if (memberIds.has(user.id as string)) memberEmails.add(String(user.email).toLowerCase())
    }
  }

  // Open invites that will be refreshed rather than added.
  const openInvites = new Map<string, string>()
  for (const part of chunk(emails, 100)) {
    const { data, error } = await supabase
      .from('organization_invitations')
      .select('id, email')
      .eq('organization_id', school.id)
      .is('accepted_at', null)
      .is('revoked_at', null)
      .in('email', part)
    if (error) throw error
    for (const row of data ?? []) openInvites.set(row.email as string, row.id as string)
  }

  const toSend = invites.filter((invite) => !memberEmails.has(invite.email))
  const newCount = toSend.filter((invite) => !openInvites.has(invite.email)).length
  if (newCount > 0 && !(await schoolHasPurchasedCredits(supabase, school))) {
    const used = await countCountedInvites(supabase, school.id)
    if (used + newCount > INVITES_BEFORE_FIRST_PURCHASE) {
      const left = Math.max(0, INVITES_BEFORE_FIRST_PURCHASE - used)
      throw new InviteLimitError(
        `Schools can send ${INVITES_BEFORE_FIRST_PURCHASE} invites before buying credits. You have ${left} left. Buy credits to invite more people.`,
      )
    }
  }

  const now = new Date()
  const expiresAt = inviteExpiry(now)
  const tokens = new Map<string, string>()
  const rows = toSend.map((invite) => {
    const token = generateInviteToken()
    tokens.set(invite.email, token)
    return {
      organization_id: school.id,
      email: invite.email,
      name: invite.name,
      role: invite.role,
      grade_level: invite.role === 'student' ? invite.gradeLevel : null,
      invited_by: inviter.id,
      token: hashInviteToken(token),
      expires_at: expiresAt.toISOString(),
    }
  })

  const failed = new Map<string, string>()
  const fresh = rows.filter((row) => !openInvites.has(row.email))
  for (const part of chunk(fresh, 100)) {
    const { error } = await supabase.from('organization_invitations').insert(part)
    if (error) {
      console.error('Failed to save invites:', error)
      for (const row of part) failed.set(row.email, 'Could not save this invite')
    }
  }
  for (const row of rows.filter((r) => openInvites.has(r.email))) {
    const { error } = await supabase
      .from('organization_invitations')
      .update({ name: row.name, role: row.role, grade_level: row.grade_level, token: row.token, expires_at: row.expires_at, last_sent_at: null })
      .eq('id', openInvites.get(row.email) as string)
    if (error) {
      console.error('Failed to refresh invite:', error)
      failed.set(row.email, 'Could not save this invite')
    }
  }

  const saved = rows.filter((row) => !failed.has(row.email))
  const delivered = await emailInvites(
    context,
    saved.map((row) => ({
      email: row.email,
      name: row.name,
      role: row.role,
      gradeLevel: row.grade_level,
      url: inviteLink(origin, tokens.get(row.email) as string),
      tokenHash: row.token,
      expiresAt,
    })),
  )

  return invites.map((invite): InviteOutcome => {
    if (memberEmails.has(invite.email)) {
      return { email: invite.email, outcome: 'skipped', emailed: false, message: 'Already in your school' }
    }
    const failure = failed.get(invite.email)
    if (failure) return { email: invite.email, outcome: 'failed', emailed: false, message: failure }
    const emailed = delivered.has(invite.email)
    return {
      email: invite.email,
      outcome: 'invited',
      emailed,
      message: openInvites.has(invite.email) ? 'Sent a fresh link' : undefined,
      // The link is only handed to the inviter when the email did not go out.
      // Otherwise only the invited address ever sees it, so nobody else can
      // use it to set up an account under that address.
      inviteUrl: emailed ? undefined : inviteLink(origin, tokens.get(invite.email) as string),
    }
  })
}

type OutgoingInvite = {
  email: string
  name: string | null
  role: string
  gradeLevel: string | null
  url: string
  tokenHash: string
  expiresAt: Date
}

/**
 * Emails the invites and records when each was sent. last_sent_at always
 * describes the current link: it is cleared whenever the token changes and set
 * only once that link has gone out by email. Returns the emails that went out.
 */
async function emailInvites({ supabase, school, inviter }: SendContext, outgoing: OutgoingInvite[]): Promise<Set<string>> {
  const delivered = new Set<string>()
  if (outgoing.length === 0 || !isEmailConfigured()) return delivered

  const messages: EmailMessage[] = outgoing.map((invite) => ({
    to: invite.email,
    ...buildInviteEmail({
      schoolName: school.name,
      inviterName: inviter.name,
      inviteeName: invite.name,
      role: invite.role,
      gradeLevel: invite.gradeLevel,
      url: invite.url,
      expiresAt: invite.expiresAt,
    }),
  }))

  const results = await sendEmails(messages)
  results.forEach((result, i) => {
    if (result.sent) delivered.add(outgoing[i].email)
  })

  if (delivered.size > 0) {
    // Match on the exact link that was emailed (its token hash), not just the
    // address: if another resend replaced the token meanwhile, that newer link
    // was not emailed and must stay unmarked.
    const sentAt = new Date().toISOString()
    const sentHashes = outgoing.filter((invite) => delivered.has(invite.email)).map((invite) => invite.tokenHash)
    for (const part of chunk(sentHashes, 100)) {
      const { error } = await supabase
        .from('organization_invitations')
        .update({ last_sent_at: sentAt })
        .eq('organization_id', school.id)
        .in('token', part)
        .is('accepted_at', null)
        .is('revoked_at', null)
      if (error) console.error('Failed to record invite sends:', error)
    }
  }
  return delivered
}

/** Gives an open invite a fresh link and expiry and emails it again. */
export async function resendSchoolInvite(context: SendContext, inviteId: string): Promise<InviteOutcome | null> {
  const { supabase, school, origin } = context
  const { data: invite, error } = await supabase
    .from('organization_invitations')
    .select('id, email, name, role, grade_level, accepted_at, revoked_at')
    .eq('id', inviteId)
    .eq('organization_id', school.id)
    .maybeSingle()
  if (error) throw error
  if (!invite || invite.accepted_at || invite.revoked_at) return null

  const token = generateInviteToken()
  const expiresAt = inviteExpiry()
  const { error: updateError } = await supabase
    .from('organization_invitations')
    .update({ token: hashInviteToken(token), expires_at: expiresAt.toISOString(), last_sent_at: null })
    .eq('id', invite.id)
  if (updateError) throw updateError

  const url = inviteLink(origin, token)
  const delivered = await emailInvites(context, [
    { email: invite.email, name: invite.name, role: invite.role, gradeLevel: invite.grade_level, url, tokenHash: hashInviteToken(token), expiresAt },
  ])
  const emailed = delivered.has(invite.email)
  return { email: invite.email, outcome: 'invited', emailed, inviteUrl: emailed ? undefined : url }
}
