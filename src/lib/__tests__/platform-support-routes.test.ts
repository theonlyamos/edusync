import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeSupabase } from './helpers/fake-supabase'

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  serverSupabase: vi.fn(),
  requireSchoolRole: vi.fn(),
  sendEmail: vi.fn(),
  emailConfigured: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ getServerSession: mocks.session }))
vi.mock('@/lib/supabase.server', () => ({ createServerSupabase: mocks.serverSupabase, createSSRUserSupabase: vi.fn() }))
vi.mock('@/lib/email', () => ({ sendEmail: mocks.sendEmail, isEmailConfigured: mocks.emailConfigured }))
vi.mock('@/lib/school-access.server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/school-access.server')>()),
  requireSchoolRole: mocks.requireSchoolRole,
}))

const { POST: addAdmin } = await import('@/app/api/admin/users/admins/route')
const { DELETE: removeAdmin } = await import('@/app/api/admin/users/admins/[adminId]/route')
const { POST: addOrgMember } = await import('@/app/api/admin/organizations/[id]/members/route')
const { POST: createStudent } = await import('@/app/api/admin/users/students/route')
const { POST: createTeacher } = await import('@/app/api/admin/users/teachers/route')
const { POST: sendReset } = await import('@/app/api/admin/users/[userId]/password-reset/route')
const timetables = await import('@/app/api/schools/current/timetables/route')

const request = (body?: unknown, method = 'POST', url = 'https://app.test/api') =>
  new NextRequest(url, { method, ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }) })
const params = <T,>(value: T) => ({ params: Promise.resolve(value) })
const asAdmin = () => mocks.session.mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } })

let fake: ReturnType<typeof fakeSupabase>
beforeEach(() => {
  vi.clearAllMocks()
  fake = fakeSupabase({
    users: [
      { id: 'admin-1', email: 'admin@test.com', role: 'admin', name: 'Admin' },
      { id: 'u-learner', email: 'ama@test.com', role: 'learner', name: 'Ama' },
      { id: 'u-teacher', email: 'kofi@test.com', role: 'teacher', name: 'Kofi' },
    ],
    admins: [{ id: 'a-1', user_id: 'admin-1' }],
    organizations: [
      { id: 'school-1', type: 'school' },
      { id: 'dev-1', type: 'developer' },
    ],
    organization_members: [],
  })
  mocks.serverSupabase.mockReturnValue(fake.client)
  asAdmin()
})

describe('platform admins', () => {
  it('makes an existing normal account an admin, with no password involved', async () => {
    const response = await addAdmin(request({ email: ' AMA@test.com ' }))
    expect(response.status).toBe(200)
    expect(fake.tables.users[1].role).toBe('admin')
    expect(fake.tables.admins.map((a) => a.user_id)).toContain('u-learner')
  })

  it('refuses unknown emails, teacher accounts and non-admins', async () => {
    expect((await addAdmin(request({ email: 'nobody@test.com' }))).status).toBe(404)
    expect((await addAdmin(request({ email: 'kofi@test.com' }))).status).toBe(409)
    mocks.session.mockResolvedValue({ user: { id: 'u-learner', role: 'learner' } })
    expect((await addAdmin(request({ email: 'ama@test.com' }))).status).toBe(403)
    expect(fake.tables.users[2].role).toBe('teacher')
  })

  it('removes admin access but keeps the account', async () => {
    fake.tables.users[1].role = 'admin'
    fake.tables.admins.push({ id: 'a-2', user_id: 'u-learner' })
    const response = await removeAdmin(request(undefined, 'DELETE'), params({ adminId: 'u-learner' }))
    expect(response.status).toBe(200)
    expect(fake.tables.users[1].role).toBe('learner')
    expect(fake.tables.admins.map((a) => a.user_id)).toEqual(['admin-1'])
  })

  it('will not remove your own or the last admin access', async () => {
    expect((await removeAdmin(request(undefined, 'DELETE'), params({ adminId: 'admin-1' }))).status).toBe(400)
    mocks.session.mockResolvedValue({ user: { id: 'other-admin', role: 'admin' } })
    expect((await removeAdmin(request(undefined, 'DELETE'), params({ adminId: 'admin-1' }))).status).toBe(409)
    expect(fake.tables.users[0].role).toBe('admin')
  })
})

describe('support no longer creates accounts', () => {
  it('turns off the student and teacher create endpoints', async () => {
    expect((await createStudent()).status).toBe(410)
    expect((await createTeacher()).status).toBe(410)
  })

  it('adds only existing accounts to developer organizations', async () => {
    const createUser = vi.fn()
    fake.client.auth = { admin: { createUser } }

    expect((await addOrgMember(request({ email: 'new@test.com', role: 'learner' }), params({ id: 'dev-1' }))).status).toBe(404)
    expect((await addOrgMember(request({ email: 'ama@test.com', role: 'student' }), params({ id: 'dev-1' }))).status).toBe(400)
    expect((await addOrgMember(request({ email: 'ama@test.com', role: 'teacher' }), params({ id: 'school-1' }))).status).toBe(400)
    expect((await addOrgMember(request({ email: 'ama@test.com', role: 'admin' }), params({ id: 'school-1' }))).status).toBe(409)

    const added = await addOrgMember(request({ email: 'ama@test.com', role: 'learner', password: 'ignored' }), params({ id: 'dev-1' }))
    expect(added.status).toBe(201)
    expect(fake.tables.organization_members).toEqual([expect.objectContaining({ organization_id: 'dev-1', user_id: 'u-learner', role: 'member' })])
    expect(createUser).not.toHaveBeenCalled()
  })
})

describe('POST /api/admin/users/[userId]/password-reset', () => {
  const generateLink = vi.fn()
  beforeEach(() => {
    generateLink.mockResolvedValue({ data: { properties: { hashed_token: 'hash-1' } }, error: null })
    fake.client.auth = { admin: { generateLink } }
    mocks.emailConfigured.mockReturnValue(true)
    mocks.sendEmail.mockResolvedValue({ sent: true, id: 'e1' })
  })

  it('emails the reset link to the account’s own address only', async () => {
    const response = await sendReset(request(undefined, 'POST', 'https://insyte.test/api/x'), params({ userId: 'u-learner' }))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({ sent: true, email: 'ama@test.com' })
    expect(JSON.stringify(body)).not.toContain('hash-1')
    expect(generateLink).toHaveBeenCalledWith(expect.objectContaining({ type: 'recovery', email: 'ama@test.com' }))
    const message = mocks.sendEmail.mock.calls[0][0]
    expect(message.to).toBe('ama@test.com')
    expect(message.text).toContain('/reset-password?token_hash=hash-1&type=recovery')
  })

  it('says so when email is not set up, and refuses non-admins', async () => {
    mocks.emailConfigured.mockReturnValue(false)
    expect((await sendReset(request(), params({ userId: 'u-learner' }))).status).toBe(503)
    mocks.session.mockResolvedValue({ user: { id: 'u-teacher', role: 'teacher' } })
    expect((await sendReset(request(), params({ userId: 'u-learner' }))).status).toBe(403)
    expect(generateLink).not.toHaveBeenCalled()
  })
})

describe('/api/schools/current/timetables', () => {
  beforeEach(() => {
    fake.tables.organization_members = [
      { organization_id: 'school-1', user_id: 'u-teacher', role: 'teacher', is_active: true },
      { organization_id: 'school-2', user_id: 'u-other-teacher', role: 'teacher', is_active: true },
    ]
    fake.tables.timetables = [
      { id: 'tt-other', organization_id: 'school-2', grade: 'primary 4', periods: [{ id: 'x', startTime: '07:00', endTime: '08:00' }], schedule: {} },
    ]
    mocks.requireSchoolRole.mockResolvedValue({
      ok: true,
      context: { userId: 'owner-1', supabase: fake.client, membership: { role: 'owner', school: { id: 'school-1', grade_levels: ['primary 4', 'primary 5'] } } },
    })
  })

  const put = (body: unknown) => timetables.PUT(request(body, 'PUT'))
  const get = (grade: string) => timetables.GET(request(undefined, 'GET', `https://app.test/api?grade=${encodeURIComponent(grade)}`))

  it('saves a grade’s timetable for this school only', async () => {
    const response = await put({
      grade: 'Primary 4',
      periods: [{ id: 'p1', startTime: '08:00', endTime: '09:00' }],
      schedule: { Monday: { p1: { subject: 'Maths', teacherId: 'u-teacher' }, }, Tuesday: { p1: { subject: 'Art', teacherId: 'u-other-teacher' } } },
    })
    expect(response.status).toBe(200)
    const mine = fake.tables.timetables.find((t) => t.organization_id === 'school-1')
    expect(mine).toMatchObject({ grade: 'primary 4', schedule: { Monday: { p1: { subject: 'Maths', teacherId: 'u-teacher' } }, Tuesday: { p1: { subject: 'Art', teacherId: '' } } } })
    expect(fake.tables.timetables.find((t) => t.id === 'tt-other')?.periods).toHaveLength(1)

    const loaded = await (await get('primary 4')).json()
    expect(loaded.timetable.periods).toEqual([{ id: 'p1', startTime: '08:00', endTime: '09:00' }])
    expect(loaded.teachers.map((t: any) => t.id)).toEqual(['u-teacher'])
  })

  it('updates the existing row instead of adding another', async () => {
    const body = { grade: 'primary 5', periods: [{ id: 'p1', startTime: '08:00', endTime: '09:00' }], schedule: {} }
    await put(body)
    await put({ ...body, periods: [{ id: 'p1', startTime: '10:00', endTime: '11:00' }] })
    const rows = fake.tables.timetables.filter((t) => t.organization_id === 'school-1')
    expect(rows).toHaveLength(1)
    expect(rows[0].periods[0].startTime).toBe('10:00')
  })

  it('refuses grades the school does not teach and broken periods', async () => {
    expect((await put({ grade: 'jhs 1', periods: [] })).status).toBe(400)
    expect((await put({ grade: 'primary 4', periods: [{ id: 'p1', startTime: '09:00', endTime: '08:00' }] })).status).toBe(400)
    expect((await get('jhs 1')).status).toBe(400)
  })
})
