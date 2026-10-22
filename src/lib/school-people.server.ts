import { createHash, randomBytes } from 'node:crypto'
import { isEmailConfigured, sendEmail } from '@/lib/email'
import { buildSchoolAccountEmail } from '@/lib/school-account-email'
import { schoolHasPurchasedCredits, type SchoolRecord, type ServiceSupabase } from '@/lib/school-access.server'
import {
  ACTIVATION_TTL_DAYS,
  PEOPLE_BEFORE_FIRST_PURCHASE,
  accountStatus,
  schoolDbErrorStatus,
  type AccountStatus,
  type NewPerson,
  type PersonUpdate,
  type SchoolPersonRole,
} from '@/lib/school-people'

/*
 * School admins create accounts for their students, teachers and other admins.
 * Each new account gets a one-time link (emailed when email is set up) where
 * the person picks a password. The same links also carry password resets.
 * Links live in organization_invitations: only the SHA-256 of the token is
 * stored; the token itself only travels in the link.
 */

export function generateLinkToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashLinkToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export const accountLinkUrl = (origin: string, token: string) => `${origin}/activate/${encodeURIComponent(token)}`

export const linkExpiry = (from = new Date()) => new Date(from.getTime() + ACTIVATION_TTL_DAYS * 24 * 60 * 60 * 1000)

export type PeopleContext = {
  supabase: ServiceSupabase
  school: Pick<SchoolRecord, 'id' | 'name' | 'owner_id' | 'total_credits_purchased' | 'grade_levels'>
  actor: { id: string; name: string | null }
  origin: string
}

/** A failure with a message the admin can act on. */
export class PeopleError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

export type LinkResult = {
  /** The link was emailed to the person. */
  emailed: boolean
  /** Only when the email did not go out, so the admin can pass the link on. */
  url?: string
  expiresAt: string
}

type LinkPerson = { email: string; name: string | null; role: string; gradeLevel: string | null }

const chunk = <T,>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size))

/** Cancels any open link for this email, makes a new one and emails it. */
export async function issueAccountLink(context: PeopleContext, person: LinkPerson, kind: 'activate' | 'reset'): Promise<LinkResult> {
  const { supabase, school, actor, origin } = context
  const email = person.email.toLowerCase()
  const now = new Date()

  const { error: revokeError } = await supabase
    .from('organization_invitations')
    .update({ revoked_at: now.toISOString() })
    .eq('organization_id', school.id)
    .eq('email', email)
    .is('accepted_at', null)
    .is('revoked_at', null)
  if (revokeError) throw revokeError

  const token = generateLinkToken()
  const expiresAt = linkExpiry(now)
  const role = person.role === 'owner' ? 'admin' : person.role
  const { error: insertError } = await supabase.from('organization_invitations').insert({
    organization_id: school.id,
    email,
    role,
    name: person.name,
    grade_level: role === 'student' ? person.gradeLevel : null,
    invited_by: actor.id,
    token: hashLinkToken(token),
    expires_at: expiresAt.toISOString(),
  })
  if (insertError) throw insertError

  const url = accountLinkUrl(origin, token)
  let emailed = false
  if (isEmailConfigured()) {
    const message = buildSchoolAccountEmail({
      kind,
      schoolName: school.name,
      senderName: actor.name,
      personName: person.name,
      role,
      gradeLevel: person.gradeLevel,
      email,
      url,
      expiresAt,
    })
    const result = await sendEmail({ to: email, ...message })
    emailed = result.sent
    if (emailed) {
      const { error } = await supabase
        .from('organization_invitations')
        .update({ last_sent_at: new Date().toISOString(), send_count: 1 })
        .eq('token', hashLinkToken(token))
      if (error) console.error('Could not record that the account email went out:', error)
    }
  }
  return { emailed, url: emailed ? undefined : url, expiresAt: expiresAt.toISOString() }
}

/** Members (other than the owner) count toward the limit before a school's first purchase. */
async function assertRoomForPeople(context: PeopleContext, adding: number) {
  const { supabase, school } = context
  if (await schoolHasPurchasedCredits(supabase, school)) return
  const { count, error } = await supabase
    .from('organization_members')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', school.id)
    .neq('role', 'owner')
  if (error) throw error
  const used = count ?? 0
  if (used + adding > PEOPLE_BEFORE_FIRST_PURCHASE) {
    const left = Math.max(0, PEOPLE_BEFORE_FIRST_PURCHASE - used)
    throw new PeopleError(
      `Schools can add ${PEOPLE_BEFORE_FIRST_PURCHASE} people before buying credits. You can add ${left} more. Buy credits to add more people.`,
      409,
    )
  }
}

const ACCOUNT_EXISTS = 'An InsyteAI account already uses this email. Use a different email address.'

export type CreatedPerson = LinkResult & { userId: string; email: string }

/**
 * Creates the account, adds it to the school with its role and profile, and
 * sends the activation link. The account has no password until the person
 * activates it.
 */
export async function createSchoolPerson(context: PeopleContext, person: NewPerson, options: { skipLimit?: boolean } = {}): Promise<CreatedPerson> {
  const { supabase, school, actor } = context
  const { data: existing, error: lookupError } = await supabase.from('users').select('id').eq('email', person.email).maybeSingle()
  if (lookupError) throw lookupError
  if (existing) throw new PeopleError(ACCOUNT_EXISTS, 409)
  if (!options.skipLimit) await assertRoomForPeople(context, 1)

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email: person.email,
    email_confirm: true,
    user_metadata: { name: person.name },
  })
  if (createError || !created?.user) {
    if (createError && /already|exists|registered/i.test(createError.message)) throw new PeopleError(ACCOUNT_EXISTS, 409)
    throw createError ?? new Error('No user returned')
  }
  const userId = created.user.id

  try {
    // School accounts start with no personal credits; the school pays.
    const { error: profileError } = await supabase
      .from('users')
      .upsert({ id: userId, email: person.email, name: person.name, role: 'learner', credits: 0 }, { onConflict: 'id' })
    if (profileError) throw profileError
    const { error: joinError } = await supabase.rpc('join_school_as', {
      p_user_id: userId,
      p_school_id: school.id,
      p_role: person.role,
      p_grade_level: person.role === 'student' ? person.gradeLevel : null,
      p_added_by: actor.id,
    })
    if (joinError) {
      const status = schoolDbErrorStatus(joinError.code)
      throw status ? new PeopleError(joinError.message, status) : joinError
    }
  } catch (error) {
    // Leave nothing half-made behind: no membership exists if joining failed.
    await supabase.from('users').delete().eq('id', userId)
    const { error: deleteError } = await supabase.auth.admin.deleteUser(userId)
    if (deleteError) console.error('Could not remove a half-created account:', deleteError)
    throw error
  }

  try {
    await saveProfileDetails(supabase, userId, person.role, person)
  } catch (error) {
    // The account works without these; the admin can fill them in later.
    console.error('Could not save profile details for a new school account:', error)
  }

  const link = await issueAccountLink(context, { email: person.email, name: person.name, role: person.role, gradeLevel: person.gradeLevel }, 'activate')
  return { userId, email: person.email, ...link }
}

async function saveProfileDetails(supabase: ServiceSupabase, userId: string, role: string, details: PersonUpdate) {
  if (role === 'student') {
    const update: Record<string, unknown> = {}
    if (details.gradeLevel !== undefined) update.grade = details.gradeLevel
    if (details.guardianName !== undefined) update.guardianname = details.guardianName
    if (details.guardianContact !== undefined) update.guardiancontact = details.guardianContact
    if (details.dateOfBirth !== undefined) update.date_of_birth = details.dateOfBirth
    if (Object.keys(update).length === 0) return
    const { error } = await supabase.from('students').update(update).eq('user_id', userId)
    if (error) throw error
  } else if (role === 'teacher') {
    const update: Record<string, unknown> = {}
    if (details.subjects !== undefined) update.subjects = details.subjects
    if (details.grades !== undefined) update.grades = details.grades
    if (Object.keys(update).length === 0) return
    const { error } = await supabase.from('teachers').update(update).eq('user_id', userId)
    if (error) throw error
  }
}

export type SchoolPerson = {
  memberId: string
  userId: string
  role: string
  name: string
  email: string
  isActive: boolean
  joinedAt: string
  status: AccountStatus
  /** When the latest activation or password link was emailed. */
  lastLinkSentAt: string | null
  gradeLevel?: string | null
  guardianName?: string | null
  guardianContact?: string | null
  dateOfBirth?: string | null
  subjects?: string[]
  grades?: string[]
  lessonCount?: number
}

type LinkRow = { email: string; accepted_at: string | null; revoked_at: string | null; expires_at: string; last_sent_at: string | null; created_at: string }

/** Everyone in the school with this page's role (owners count as administrators). */
export async function listSchoolPeople(supabase: ServiceSupabase, schoolId: string, role: SchoolPersonRole): Promise<SchoolPerson[]> {
  const roles = role === 'admin' ? ['owner', 'admin'] : [role]
  const { data: members, error } = await supabase
    .from('organization_members')
    .select('id, user_id, role, is_active, joined_at')
    .eq('organization_id', schoolId)
    .in('role', roles)
    .order('joined_at', { ascending: false })
    .limit(10000)
  if (error) throw error
  const rows = members ?? []
  const userIds = rows.map((m) => m.user_id as string)

  const users = new Map<string, { name: string | null; email: string }>()
  const students = new Map<string, any>()
  const teachers = new Map<string, any>()
  for (const ids of chunk(userIds, 200)) {
    const { data, error: usersError } = await supabase.from('users').select('id, name, email').in('id', ids)
    if (usersError) throw usersError
    for (const u of data ?? []) users.set(u.id as string, { name: u.name as string | null, email: String(u.email ?? '') })
    if (role === 'student') {
      const { data: profiles, error: profileError } = await supabase
        .from('students')
        .select('user_id, grade, guardianname, guardiancontact, date_of_birth')
        .in('user_id', ids)
      if (profileError) throw profileError
      for (const p of profiles ?? []) students.set(p.user_id as string, p)
    } else if (role === 'teacher') {
      const { data: profiles, error: profileError } = await supabase
        .from('teachers')
        .select('id, user_id, subjects, grades')
        .in('user_id', ids)
      if (profileError) throw profileError
      for (const p of profiles ?? []) teachers.set(p.user_id as string, p)
    }
  }

  const lessonCounts = new Map<string, number>()
  if (role === 'teacher' && teachers.size > 0) {
    const { data: lessons, error: lessonError } = await supabase
      .from('lessons')
      .select('teacher_id')
      .eq('organization_id', schoolId)
      .is('archived_at', null)
      .limit(20000)
    if (lessonError) throw lessonError
    for (const l of lessons ?? []) lessonCounts.set(l.teacher_id as string, (lessonCounts.get(l.teacher_id as string) ?? 0) + 1)
  }

  const links = new Map<string, LinkRow[]>()
  const emails = [...new Set([...users.values()].map((u) => u.email.toLowerCase()).filter(Boolean))]
  for (const part of chunk(emails, 200)) {
    const { data, error: linkError } = await supabase
      .from('organization_invitations')
      .select('email, accepted_at, revoked_at, expires_at, last_sent_at, created_at')
      .eq('organization_id', schoolId)
      .in('email', part)
    if (linkError) throw linkError
    for (const link of (data ?? []) as LinkRow[]) {
      const list = links.get(link.email) ?? []
      list.push(link)
      links.set(link.email, list)
    }
  }

  const now = new Date()
  return rows.map((m) => {
    const user = users.get(m.user_id as string)
    const email = user?.email ?? ''
    const personLinks = links.get(email.toLowerCase()) ?? []
    const latestSent = personLinks
      .map((l) => l.last_sent_at)
      .filter((v): v is string => Boolean(v))
      .sort()
      .at(-1) ?? null
    const person: SchoolPerson = {
      memberId: m.id as string,
      userId: m.user_id as string,
      role: m.role as string,
      name: user?.name?.trim() || email || 'Unknown',
      email,
      isActive: Boolean(m.is_active),
      joinedAt: m.joined_at as string,
      status: accountStatus({ is_active: Boolean(m.is_active) }, personLinks, now),
      lastLinkSentAt: latestSent,
    }
    if (role === 'student') {
      const s = students.get(m.user_id as string)
      person.gradeLevel = s?.grade ?? null
      person.guardianName = s?.guardianname ?? null
      person.guardianContact = s?.guardiancontact ?? null
      person.dateOfBirth = s?.date_of_birth ?? null
    } else if (role === 'teacher') {
      const t = teachers.get(m.user_id as string)
      person.subjects = t?.subjects ?? []
      person.grades = t?.grades ?? []
      person.lessonCount = t ? lessonCounts.get(t.id as string) ?? 0 : 0
    }
    return person
  })
}

export type MemberRecord = { id: string; user_id: string; role: string; is_active: boolean }

/** One member of this school, by membership id. */
export async function findSchoolMember(supabase: ServiceSupabase, schoolId: string, memberId: string): Promise<MemberRecord | null> {
  const { data, error } = await supabase
    .from('organization_members')
    .select('id, user_id, role, is_active')
    .eq('id', memberId)
    .eq('organization_id', schoolId)
    .maybeSingle()
  if (error) throw error
  return (data as MemberRecord | null) ?? null
}

/** Whether this person has activated their account (see accountStatus). */
export async function isActivated(supabase: ServiceSupabase, schoolId: string, email: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('organization_invitations')
    .select('accepted_at, revoked_at, expires_at')
    .eq('organization_id', schoolId)
    .eq('email', email.toLowerCase())
  if (error) throw error
  return accountStatus({ is_active: true }, (data ?? []) as LinkRow[]) === 'active'
}

async function loadLinkPerson(supabase: ServiceSupabase, member: MemberRecord) {
  const { data: user, error } = await supabase.from('users').select('id, name, email').eq('id', member.user_id).maybeSingle()
  if (error) throw error
  if (!user?.email) throw new PeopleError('This account has no email address.', 409)
  let gradeLevel: string | null = null
  if (member.role === 'student') {
    const { data: student, error: studentError } = await supabase.from('students').select('grade').eq('user_id', member.user_id).maybeSingle()
    if (studentError) throw studentError
    gradeLevel = (student?.grade as string | null) ?? null
  }
  return { email: String(user.email).toLowerCase(), name: (user.name as string | null) ?? null, role: member.role, gradeLevel }
}

/**
 * People who joined before activation links existed have no used link. Before
 * their first password link, store a used one, so the new open link doesn't
 * make them look "not activated" and the link page knows it is a reset.
 */
async function recordEarlierActivation(context: PeopleContext, person: LinkPerson) {
  const { supabase, school, actor } = context
  const { count, error } = await supabase
    .from('organization_invitations')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', school.id)
    .eq('email', person.email)
    .not('accepted_at', 'is', null)
  if (error) throw error
  if ((count ?? 0) > 0) return
  const now = new Date().toISOString()
  const role = person.role === 'owner' ? 'admin' : person.role
  const { error: insertError } = await supabase.from('organization_invitations').insert({
    organization_id: school.id,
    email: person.email,
    role,
    name: person.name,
    grade_level: role === 'student' ? person.gradeLevel : null,
    invited_by: actor.id,
    // Never sent anywhere: a hash of a random value nobody holds.
    token: hashLinkToken(generateLinkToken()),
    expires_at: now,
    accepted_at: now,
  })
  if (insertError) throw insertError
}

/**
 * Sends a fresh link: an activation link while the account was never
 * activated, otherwise a link to set a new password.
 */
export async function sendAccountLink(context: PeopleContext, member: MemberRecord): Promise<LinkResult & { kind: 'activate' | 'reset' }> {
  if (!member.is_active) throw new PeopleError('Reactivate this person first.', 409)
  const person = await loadLinkPerson(context.supabase, member)
  const activated = await isActivated(context.supabase, context.school.id, person.email)
  const kind = activated ? 'reset' : 'activate'
  if (activated) await recordEarlierActivation(context, person)
  const link = await issueAccountLink(context, person, kind)
  return { ...link, kind }
}

/** Saves an admin's edits. An email can only change before the person has activated their account. */
export async function updateSchoolPerson(context: PeopleContext, member: MemberRecord, update: PersonUpdate): Promise<{ link?: LinkResult }> {
  const { supabase, school } = context
  let link: LinkResult | undefined

  if (update.email !== undefined) {
    const current = await loadLinkPerson(supabase, member)
    if (update.email !== current.email) {
      if (await isActivated(supabase, school.id, current.email)) {
        throw new PeopleError('This person already signs in with their email, so it can’t be changed here.', 409)
      }
      const { data: taken, error: takenError } = await supabase.from('users').select('id').eq('email', update.email).maybeSingle()
      if (takenError) throw takenError
      if (taken) throw new PeopleError(ACCOUNT_EXISTS, 409)
      const { error: authError } = await supabase.auth.admin.updateUserById(member.user_id, { email: update.email, email_confirm: true })
      if (authError) {
        if (/already|exists|registered/i.test(authError.message)) throw new PeopleError(ACCOUNT_EXISTS, 409)
        throw authError
      }
      const { error: emailError } = await supabase.from('users').update({ email: update.email }).eq('id', member.user_id)
      if (emailError) throw emailError
      // The old address's link no longer leads anywhere useful.
      const { error: revokeError } = await supabase
        .from('organization_invitations')
        .update({ revoked_at: new Date().toISOString() })
        .eq('organization_id', school.id)
        .eq('email', current.email)
        .is('accepted_at', null)
        .is('revoked_at', null)
      if (revokeError) throw revokeError
      if (member.is_active) {
        link = await issueAccountLink(
          context,
          { ...current, email: update.email, name: update.name ?? current.name, gradeLevel: update.gradeLevel ?? current.gradeLevel },
          'activate',
        )
      }
    }
  }

  if (update.name !== undefined) {
    const { error } = await supabase.from('users').update({ name: update.name }).eq('id', member.user_id)
    if (error) throw error
  }
  await saveProfileDetails(supabase, member.user_id, member.role, update)
  return { link }
}

/** Revokes open links, e.g. when someone is deactivated. */
export async function revokeAccountLinks(supabase: ServiceSupabase, schoolId: string, email: string) {
  const { error } = await supabase
    .from('organization_invitations')
    .update({ revoked_at: new Date().toISOString() })
    .eq('organization_id', schoolId)
    .eq('email', email.toLowerCase())
    .is('accepted_at', null)
    .is('revoked_at', null)
  if (error) throw error
}

export type AccountLinkLookup = {
  id: string
  email: string
  name: string | null
  role: string
  schoolName: string
  /** Whether this link sets the first password (activation) or a new one. */
  kind: 'activate' | 'reset'
  state: 'pending' | 'used' | 'expired' | 'cancelled'
}

/** Finds an activation or password link by the token in its URL. */
export async function findAccountLink(supabase: ServiceSupabase, token: string): Promise<(AccountLinkLookup & { schoolId: string }) | null> {
  if (!token || token.length > 200) return null
  const { data, error } = await supabase
    .from('organization_invitations')
    .select('id, email, name, role, organization_id, expires_at, accepted_at, revoked_at, organizations!inner(id, name, type, is_active)')
    .eq('token', hashLinkToken(token))
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const school = (Array.isArray(data.organizations) ? data.organizations[0] : data.organizations) as
    | { id: string; name: string; type: string; is_active: boolean }
    | undefined
  if (!school || school.type !== 'school') return null

  const state: AccountLinkLookup['state'] = data.accepted_at
    ? 'used'
    : data.revoked_at || !school.is_active
      ? 'cancelled'
      : new Date(data.expires_at as string).getTime() < Date.now()
        ? 'expired'
        : 'pending'
  // An earlier link to the same address that was used means this one is a password reset.
  const { count, error: countError } = await supabase
    .from('organization_invitations')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', school.id)
    .eq('email', data.email)
    .neq('id', data.id)
    .not('accepted_at', 'is', null)
  if (countError) throw countError
  const kind: 'activate' | 'reset' = (count ?? 0) > 0 ? 'reset' : 'activate'

  return {
    id: data.id as string,
    email: data.email as string,
    name: (data.name as string | null) ?? null,
    role: data.role as string,
    schoolId: school.id,
    schoolName: school.name,
    kind,
    state,
  }
}

/**
 * Sets the password for the account behind a valid link and marks the link
 * used. The person must still be an active member of the school.
 */
export async function completeAccountLink(supabase: ServiceSupabase, token: string, password: string): Promise<{ email: string; role: string }> {
  const link = await findAccountLink(supabase, token)
  if (!link) throw new PeopleError('This link is not valid.', 404)
  if (link.state === 'used') throw new PeopleError('This link was already used. Sign in with your password.', 409)
  if (link.state === 'expired') throw new PeopleError('This link has expired. Ask your school to send a new one.', 410)
  if (link.state === 'cancelled') throw new PeopleError('This link was replaced or cancelled. Use the newest email from your school.', 410)

  const { data: user, error: userError } = await supabase.from('users').select('id').eq('email', link.email).maybeSingle()
  if (userError) throw userError
  if (!user) throw new PeopleError('This account no longer exists.', 404)
  const { data: member, error: memberError } = await supabase
    .from('organization_members')
    .select('role, is_active')
    .eq('organization_id', link.schoolId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (memberError) throw memberError
  if (!member?.is_active) throw new PeopleError('Your school has turned this account off. Ask them to turn it back on.', 403)

  // Claim the link first so it can't be used twice at the same moment.
  const { data: claimed, error: claimError } = await supabase
    .from('organization_invitations')
    .update({ accepted_at: new Date().toISOString(), accepted_by: user.id })
    .eq('id', link.id)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .select('id')
  if (claimError) throw claimError
  if (!claimed || claimed.length === 0) throw new PeopleError('This link was already used. Sign in with your password.', 409)

  const { error: passwordError } = await supabase.auth.admin.updateUserById(user.id as string, { password, email_confirm: true })
  if (passwordError) {
    await supabase.from('organization_invitations').update({ accepted_at: null, accepted_by: null }).eq('id', link.id)
    if (/weak|short|password/i.test(passwordError.message)) throw new PeopleError(passwordError.message, 400)
    throw passwordError
  }
  return { email: link.email, role: member.role as string }
}

/** Turns a thrown error into the response a school people route returns. */
export function peopleErrorResponse(error: unknown, fallback: string, where: string) {
  if (error instanceof PeopleError) return { body: { error: error.message }, status: error.status }
  console.error(`Error in ${where}:`, error)
  return { body: { error: fallback }, status: 500 }
}

/** Sets someone's access: active or deactivated. Their work and history stay. */
export async function setMemberActive(supabase: ServiceSupabase, schoolId: string, member: MemberRecord, isActive: boolean) {
  // Teacher and student access also follows users.role (portals and the
  // service-role routes check it), so a deactivated teacher or student drops
  // to a plain learner account and gets their role back on reactivation.
  const portalRole = member.role === 'teacher' || member.role === 'student' ? member.role : null
  const setAppRole = async (role: string) => {
    const { error } = await supabase.from('users').update({ role }).eq('id', member.user_id)
    if (error) throw error
  }
  if (!isActive && portalRole) await setAppRole('learner')
  const { error } = await supabase.from('organization_members').update({ is_active: isActive }).eq('id', member.id)
  if (error) {
    if (error.code === '23505') throw new PeopleError('This person has joined another school since', 409)
    throw error
  }
  if (isActive && portalRole) await setAppRole(portalRole)
  if (!isActive) {
    const { data: user } = await supabase.from('users').select('email').eq('id', member.user_id).maybeSingle()
    if (user?.email) await revokeAccountLinks(supabase, schoolId, String(user.email))
  }
}

