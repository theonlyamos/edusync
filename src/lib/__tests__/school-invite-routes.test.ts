import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeSupabase } from './helpers/fake-supabase'

const mocks = vi.hoisted(() => ({
  requireSchoolRole: vi.fn(),
  serverSupabase: vi.fn(),
  findInvite: vi.fn(),
}))

vi.mock('@/lib/school-access.server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/school-access.server')>()),
  requireSchoolRole: mocks.requireSchoolRole,
}))
vi.mock('@/lib/supabase.server', () => ({
  createServerSupabase: mocks.serverSupabase,
  createSSRUserSupabase: vi.fn(),
}))
vi.mock('@/lib/rate-limiter', () => ({ rateLimit: vi.fn(async () => null) }))
vi.mock('@/lib/school-invite-lookup.server', () => ({ findInviteByToken: mocks.findInvite }))

const { PATCH: patchMember } = await import('@/app/api/schools/current/members/[memberId]/route')
const { POST: signup } = await import('@/app/api/invites/[token]/signup/route')

const json = (body: unknown) =>
  new NextRequest('https://app.test/api', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })

describe('PATCH /api/schools/current/members/[memberId]', () => {
  let fake: ReturnType<typeof fakeSupabase>
  beforeEach(() => {
    fake = fakeSupabase({
      users: [
        { id: 'u-teacher', role: 'teacher' },
        { id: 'u-owner', role: 'learner' },
      ],
      organization_members: [
        { id: 'm-teacher', organization_id: 'school-1', user_id: 'u-teacher', role: 'teacher', is_active: true },
        { id: 'm-owner', organization_id: 'school-1', user_id: 'u-owner', role: 'owner', is_active: true },
        { id: 'm-elsewhere', organization_id: 'school-2', user_id: 'u-x', role: 'teacher', is_active: true },
      ],
    })
    mocks.requireSchoolRole.mockResolvedValue({
      ok: true,
      context: { userId: 'u-admin', userName: 'Admin', supabase: fake.client, membership: { role: 'admin', school: { id: 'school-1' } } },
    })
  })

  const call = (memberId: string, isActive: boolean) =>
    patchMember(json({ isActive }), { params: Promise.resolve({ memberId }) })

  it('takes away teacher access with the membership and gives it back on reactivation', async () => {
    expect((await call('m-teacher', false)).status).toBe(200)
    expect(fake.tables.organization_members[0].is_active).toBe(false)
    expect(fake.tables.users[0].role).toBe('learner')

    expect((await call('m-teacher', true)).status).toBe(200)
    expect(fake.tables.organization_members[0].is_active).toBe(true)
    expect(fake.tables.users[0].role).toBe('teacher')
  })

  it('refuses the owner and members of other schools', async () => {
    expect((await call('m-owner', false)).status).toBe(409)
    expect((await call('m-elsewhere', false)).status).toBe(404)
    expect(fake.tables.users[1].role).toBe('learner')
  })
})

describe('POST /api/invites/[token]/signup', () => {
  const createUser = vi.fn()
  let fake: ReturnType<typeof fakeSupabase>
  beforeEach(() => {
    createUser.mockReset()
    createUser.mockResolvedValue({ data: { user: { id: 'new-user' } }, error: null })
    fake = fakeSupabase({ users: [] })
    fake.client.auth = { admin: { createUser } }
    fake.client.from = ((original) => (table: string) => {
      const builder = original(table)
      builder.upsert = (row: any) => { fake.tables[table].push(row); return builder }
      return builder
    })(fake.client.from)
    mocks.serverSupabase.mockReturnValue(fake.client)
  })

  const invite = (linkEmailed: boolean) => ({
    id: 'inv-1', email: 'kofi@example.com', name: null, role: 'teacher', gradeLevel: null,
    state: 'pending', linkEmailed, schoolId: 'school-1', schoolName: 'Hilltop',
  })
  const call = () => signup(json({ name: 'Kofi', password: 'long-enough' }), { params: Promise.resolve({ token: 'tok' }) })

  it('creates a confirmed account only when the link was emailed to the address', async () => {
    mocks.findInvite.mockResolvedValue(invite(true))
    expect((await call()).status).toBe(201)
    expect(createUser).toHaveBeenCalledWith(expect.objectContaining({ email: 'kofi@example.com', email_confirm: true }))
    expect(fake.tables.users[0]).toMatchObject({ id: 'new-user', role: 'teacher', credits: 0 })
  })

  it('asks a hand-shared link to confirm the email instead', async () => {
    mocks.findInvite.mockResolvedValue(invite(false))
    const response = await call()
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ confirmEmail: true })
    expect(createUser).not.toHaveBeenCalled()
  })
})
