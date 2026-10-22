import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  completeAccountLink,
  createSchoolPerson,
  findAccountLink,
  hashLinkToken,
  listSchoolPeople,
  PeopleError,
  sendAccountLink,
  setMemberActive,
} from '@/lib/school-people.server'
import type { NewPerson } from '@/lib/school-people'
import { fakeSupabase, type Row } from './helpers/fake-supabase'

const school = { id: 'school-1', name: 'Hilltop', owner_id: 'owner-1', total_credits_purchased: 0, grade_levels: ['jhs 1'] }

/** The fake plus auth admin calls and a join_school_as that behaves like the database function. */
function setup(tables: Record<string, Row[]> = {}, options: { joinError?: { code: string; message: string } } = {}) {
  const fake = fakeSupabase({
    users: [],
    organization_members: [],
    organization_invitations: [],
    students: [],
    teachers: [],
    credit_transactions: [],
    lessons: [],
    ...tables,
  })
  let nextUser = 1
  const auth = {
    createUser: vi.fn(async ({ email }: { email: string }) => ({ data: { user: { id: `user-${nextUser++}`, email } }, error: null })),
    deleteUser: vi.fn(async () => ({ error: null })),
    updateUserById: vi.fn(async () => ({ error: null })),
  }
  const client = fake.client
  client.auth = { admin: auth }
  client.rpc = async (name: string, args: any) => {
    fake.rpcCalls.push({ name, args })
    if (name !== 'join_school_as') return { error: null }
    if (options.joinError) return { error: options.joinError }
    fake.tables.organization_members.push({ id: `m-${args.p_user_id}`, organization_id: args.p_school_id, user_id: args.p_user_id, role: args.p_role, is_active: true, joined_at: '2026-10-22T10:00:00Z' })
    if (args.p_role === 'student') fake.tables.students.push({ user_id: args.p_user_id, grade: args.p_grade_level, organization_id: args.p_school_id })
    if (args.p_role === 'teacher') fake.tables.teachers.push({ id: `t-${args.p_user_id}`, user_id: args.p_user_id, organization_id: args.p_school_id, subjects: [], grades: [] })
    const user = fake.tables.users.find((u) => u.id === args.p_user_id)
    if (user && args.p_role !== 'admin') user.role = args.p_role
    return { error: null }
  }
  const context = { supabase: client, school, actor: { id: 'owner-1', name: 'Mrs Owusu' }, origin: 'https://app.test' }
  return { fake, auth, context }
}

const student = (email: string): NewPerson => ({
  role: 'student',
  name: 'Ama Mensah',
  email,
  gradeLevel: 'jhs 1',
  guardianName: 'Kofi',
  guardianContact: null,
  dateOfBirth: null,
  subjects: [],
  grades: [],
})

const tokenFrom = (url: string) => decodeURIComponent(url.split('/activate/')[1])

/** The fake has no joins: give each link the school row PostgREST would embed. */
function embedSchool(fake: { tables: Record<string, Row[]> }, isActive = true) {
  for (const row of fake.tables.organization_invitations) {
    row.organizations = { id: 'school-1', name: 'Hilltop', type: 'school', is_active: isActive }
  }
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('createSchoolPerson', () => {
  it('creates the account, adds it to the school and returns the link when email is off', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    const { fake, auth, context } = setup()

    const created = await createSchoolPerson(context as any, student('ama@x.co'))

    expect(auth.createUser).toHaveBeenCalledWith({ email: 'ama@x.co', email_confirm: true, user_metadata: { name: 'Ama Mensah' } })
    expect(fake.tables.users[0]).toMatchObject({ email: 'ama@x.co', role: 'student', credits: 0 })
    expect(fake.tables.students[0]).toMatchObject({ grade: 'jhs 1', guardianname: 'Kofi' })
    expect(created.emailed).toBe(false)
    const link = fake.tables.organization_invitations[0]
    expect(link).toMatchObject({ organization_id: 'school-1', email: 'ama@x.co', role: 'student', grade_level: 'jhs 1' })
    // Only the hash is stored.
    expect(link.token).toBe(hashLinkToken(tokenFrom(created.url!)))
  })

  it('keeps the account and reports it when the link cannot be made', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    const { fake, auth, context } = setup()
    const from = context.supabase.from
    context.supabase.from = (table: string) => {
      if (table !== 'organization_invitations') return from(table)
      const failing: any = new Proxy({}, {
        get: (_t, prop) => prop === 'then'
          ? (resolve: (v: unknown) => void) => resolve({ data: null, error: { message: 'boom' } })
          : () => failing,
      })
      return failing
    }

    const created = await createSchoolPerson(context as any, student('ama@x.co'))

    expect(created).toMatchObject({ emailed: false, linkFailed: true })
    expect(auth.deleteUser).not.toHaveBeenCalled()
    expect(fake.tables.organization_members).toHaveLength(1)
  })

  it('emails the link when email is set up', async () => {
    vi.stubEnv('RESEND_API_KEY', 'key')
    vi.stubEnv('EMAIL_FROM', 'InsyteAI <hi@x.co>')
    const sent: any[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: any) => {
      sent.push(JSON.parse(init.body))
      return new Response(JSON.stringify({ id: 'email-1' }), { status: 200 })
    }))
    const { fake, context } = setup()

    const created = await createSchoolPerson(context as any, student('ama@x.co'))

    expect(created.emailed).toBe(true)
    expect(created.url).toBeUndefined()
    expect(sent[0].to).toEqual(['ama@x.co'])
    expect(sent[0].text).toContain('https://app.test/activate/')
    expect(fake.tables.organization_invitations[0].last_sent_at).toBeTruthy()
  })

  it('refuses an email that already has an account', async () => {
    const { auth, context } = setup({ users: [{ id: 'u1', email: 'ama@x.co' }] })
    await expect(createSchoolPerson(context as any, student('ama@x.co'))).rejects.toThrow(PeopleError)
    expect(auth.createUser).not.toHaveBeenCalled()
  })

  it('removes the half-made account when joining the school fails', async () => {
    const { fake, auth, context } = setup({}, { joinError: { code: 'P0001', message: 'This school is not taking new members' } })
    await expect(createSchoolPerson(context as any, student('ama@x.co'))).rejects.toMatchObject({ status: 409 })
    expect(fake.tables.users).toHaveLength(0)
    expect(auth.deleteUser).toHaveBeenCalledWith('user-1')
    expect(fake.tables.organization_invitations).toHaveLength(0)
  })

  it('stops at the limit before the school buys credits', async () => {
    const members = Array.from({ length: 100 }, (_, i) => ({ id: `m${i}`, organization_id: 'school-1', user_id: `u${i}`, role: 'student', is_active: true }))
    const { auth, context } = setup({ organization_members: members })
    await expect(createSchoolPerson(context as any, student('ama@x.co'))).rejects.toThrow(/add 0 more/)
    expect(auth.createUser).not.toHaveBeenCalled()
  })
})

describe('account links', () => {
  it('activates once, sets the password and then reads as used', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    const { fake, auth, context } = setup()
    const created = await createSchoolPerson(context as any, student('ama@x.co'))
    const token = tokenFrom(created.url!)
    embedSchool(fake)

    expect(await findAccountLink(fake.client, token)).toMatchObject({ state: 'pending', kind: 'activate', schoolName: 'Hilltop' })
    const result = await completeAccountLink(fake.client, token, 'a-good-password')

    expect(result).toEqual({ email: 'ama@x.co', role: 'student' })
    expect(auth.updateUserById).toHaveBeenCalledWith(created.userId, { password: 'a-good-password', email_confirm: true })
    await expect(completeAccountLink(fake.client, token, 'another-password')).rejects.toMatchObject({ status: 409 })
  })

  it('refuses a link for someone the school deactivated', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    const { fake, context } = setup()
    const created = await createSchoolPerson(context as any, student('ama@x.co'))
    const member = fake.tables.organization_members[0]
    await setMemberActive(fake.client, 'school-1', member as any, false)

    expect(fake.tables.users[0].role).toBe('learner')
    embedSchool(fake)
    expect(await findAccountLink(fake.client, tokenFrom(created.url!))).toMatchObject({ state: 'cancelled' })
  })

  it('sends a password link (not an activation link) to someone who joined before links existed', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    const { fake, context } = setup({
      users: [{ id: 'u1', email: 'old@x.co', name: 'Old Teacher' }],
      organization_members: [{ id: 'm1', organization_id: 'school-1', user_id: 'u1', role: 'teacher', is_active: true }],
    })

    const result = await sendAccountLink(context as any, { id: 'm1', user_id: 'u1', role: 'teacher', is_active: true })

    expect(result.kind).toBe('reset')
    embedSchool(fake)
    expect(await findAccountLink(fake.client, tokenFrom(result.url!))).toMatchObject({ kind: 'reset', state: 'pending' })
    const people = await listSchoolPeople(fake.client, 'school-1', 'teacher')
    expect(people[0].status).toBe('active')
  })
})

describe('listSchoolPeople', () => {
  it('joins profiles and shows who still has to activate', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    const { fake, context } = setup()
    await createSchoolPerson(context as any, student('ama@x.co'))
    fake.tables.users.push({ id: 'u-old', email: 'old@x.co', name: 'Kwame' })
    fake.tables.organization_members.push({ id: 'm-old', organization_id: 'school-1', user_id: 'u-old', role: 'student', is_active: true, joined_at: '2026-01-01T00:00:00Z' })
    fake.tables.students.push({ user_id: 'u-old', grade: 'jhs 1', organization_id: 'school-1' })

    const people = await listSchoolPeople(fake.client, 'school-1', 'student')

    expect(people.map((p) => [p.email, p.status, p.gradeLevel, p.guardianName])).toEqual([
      ['ama@x.co', 'pending', 'jhs 1', 'Kofi'],
      ['old@x.co', 'active', 'jhs 1', null],
    ])
  })
})
