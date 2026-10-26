import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeSupabase } from './helpers/fake-supabase'
import {
  change,
  describeAction,
  lastDays,
  lastMonths,
  parseGrantCredits,
  parseReason,
  parseTrialDays,
} from '@/lib/platform-admin'

const mocks = vi.hoisted(() => ({ session: vi.fn(), serverSupabase: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getServerSession: mocks.session }))
vi.mock('@/lib/supabase.server', () => ({ createServerSupabase: mocks.serverSupabase, createSSRUserSupabase: vi.fn() }))

const server = await import('@/lib/platform-admin.server')
const { POST: schoolAction } = await import('@/app/api/admin/schools/[schoolId]/actions/route')
const { POST: userAction } = await import('@/app/api/admin/users/[userId]/actions/route')

const NOW = new Date('2026-10-26T12:00:00Z')
const ADMIN = '00000000-0000-4000-8000-000000000001'
const SCHOOL = '00000000-0000-4000-8000-0000000000a1'
const OWNER = '00000000-0000-4000-8000-000000000011'
const TEACHER = '00000000-0000-4000-8000-000000000012'
const STUDENT = '00000000-0000-4000-8000-000000000013'
const LEARNER = '00000000-0000-4000-8000-000000000014'
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString()

let fake: ReturnType<typeof fakeSupabase>
let updateUserById: ReturnType<typeof vi.fn>
const context = () => ({ adminId: ADMIN, supabase: fake.client })

beforeEach(() => {
  vi.clearAllMocks()
  fake = fakeSupabase({
    organizations: [
      { id: SCHOOL, type: 'school', name: 'Hilltop', is_active: true, owner_id: OWNER, credits: 0, trial_credits: 200, trial_expires_at: days(3), created_at: days(-27) },
    ],
    organization_members: [
      { id: 'm-owner', organization_id: SCHOOL, user_id: OWNER, role: 'owner', is_active: true },
      { id: 'm-teacher', organization_id: SCHOOL, user_id: TEACHER, role: 'teacher', is_active: true },
      { id: 'm-student', organization_id: SCHOOL, user_id: STUDENT, role: 'student', is_active: true },
    ],
    users: [
      { id: ADMIN, email: 'support@test.com', role: 'admin', isactive: true, created_at: days(-100) },
      { id: OWNER, email: 'owner@test.com', role: 'learner', isactive: true, created_at: days(-27) },
      { id: TEACHER, email: 'kofi@test.com', name: 'Kofi', role: 'teacher', isactive: true, created_at: days(-20) },
      { id: STUDENT, email: 'esi@test.com', name: 'Esi', role: 'student', isactive: true, created_at: days(-2) },
      { id: LEARNER, email: 'ama@test.com', name: 'Ama', role: 'learner', isactive: true, created_at: days(-1) },
    ],
    platform_admin_actions: [],
  })
  updateUserById = vi.fn().mockResolvedValue({ error: null })
  fake.client.auth = { admin: { updateUserById } }
  mocks.serverSupabase.mockReturnValue(fake.client)
  mocks.session.mockResolvedValue({ user: { id: ADMIN, role: 'admin' } })
})

const post = (body: unknown) => new NextRequest('https://app.test/api', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })
const params = <T,>(value: T) => ({ params: Promise.resolve(value) })

describe('admin input rules', () => {
  it('accepts whole credit grants and trial extensions within limits', () => {
    expect(parseGrantCredits(500)).toBe(500)
    expect(parseGrantCredits('25')).toBe(25)
    for (const bad of [0, -5, 1.5, 100_001, '', 'ten', null]) expect(parseGrantCredits(bad)).toBeNull()
    expect(parseTrialDays(14)).toBe(14)
    for (const bad of [0, 91, 2.5, 'x']) expect(parseTrialDays(bad)).toBeNull()
  })

  it('needs a short reason', () => {
    expect(parseReason('  pilot   school ')).toBe('pilot school')
    expect(parseReason('   ')).toBeNull()
    expect(parseReason('x'.repeat(301))).toBeNull()
    expect(parseReason(42)).toBeNull()
  })

  it('builds month and day keys, oldest first', () => {
    expect(lastMonths(3, NOW)).toEqual(['2026-08', '2026-09', '2026-10'])
    expect(lastMonths(2, new Date('2026-01-15T00:00:00Z'))).toEqual(['2025-12', '2026-01'])
    expect(lastDays(2, NOW)).toEqual(['2026-10-25', '2026-10-26'])
  })

  it('compares with last month', () => {
    expect(change(150, 100)).toBe(50)
    expect(change(0, 0)).toBe(0)
    expect(change(5, 0)).toBeNull()
  })

  it('reads activity entries as sentences', () => {
    expect(describeAction({ action: 'school.grant_credits', targetLabel: 'Hilltop', details: { credits: 1200 } })).toBe('Gave Hilltop 1,200 credits')
    expect(describeAction({ action: 'school.transfer_owner', targetLabel: 'Hilltop', details: { newOwnerEmail: 'kofi@test.com' } })).toBe('Made kofi@test.com the owner of Hilltop')
    expect(describeAction({ action: 'user.deactivate', targetLabel: 'ama@test.com', details: {} })).toBe('Deactivated ama@test.com')
  })
})

describe('school support actions', () => {
  it('gives credits through the ledger and logs who and why', async () => {
    await server.grantSchoolCredits(context(), SCHOOL, 300, 'Pilot')
    expect(fake.rpcCalls).toEqual([
      { name: 'add_school_credits', args: expect.objectContaining({ p_organization_id: SCHOOL, p_amount: 300, p_type: 'adjustment', p_description: 'Given by InsyteAI: Pilot', p_user_id: ADMIN }) },
    ])
    expect(fake.tables.platform_admin_actions).toEqual([
      expect.objectContaining({ admin_id: ADMIN, action: 'school.grant_credits', target_id: SCHOOL, target_label: 'Hilltop', details: { credits: 300, reason: 'Pilot' } }),
    ])
  })

  it('extends a running trial from its end date, and refuses an ended one', async () => {
    const { trialExpiresAt } = await server.extendSchoolTrial(context(), SCHOOL, 14, 'More time', NOW)
    expect(trialExpiresAt).toBe(days(17))
    expect(fake.tables.organizations[0].trial_expires_at).toBe(days(17))

    fake.tables.organizations[0].trial_expires_at = days(-1)
    await expect(server.extendSchoolTrial(context(), SCHOOL, 14, 'More time', NOW)).rejects.toMatchObject({ status: 409 })
  })

  it('suspends and reactivates, refusing a change that does nothing', async () => {
    await server.setSchoolActive(context(), SCHOOL, false, 'Unpaid')
    expect(fake.tables.organizations[0].is_active).toBe(false)
    await expect(server.setSchoolActive(context(), SCHOOL, false, 'Again')).rejects.toMatchObject({ status: 409 })
    await server.setSchoolActive(context(), SCHOOL, true, 'Paid')
    expect(fake.tables.platform_admin_actions.map((a) => a.action)).toEqual(['school.suspend', 'school.reactivate'])
  })

  it('won’t suspend the default school', async () => {
    fake.tables.organizations[0].is_default_school = true
    await expect(server.setSchoolActive(context(), SCHOOL, false, 'x')).rejects.toMatchObject({ status: 409 })
    expect(fake.tables.organizations[0].is_active).toBe(true)
  })

  it('hands ownership to a teacher and keeps the old owner as an administrator', async () => {
    await server.transferSchoolOwnership(context(), SCHOOL, TEACHER, 'Owner left')
    const role = (id: string) => fake.tables.organization_members.find((m) => m.id === id)?.role
    expect(role('m-teacher')).toBe('owner')
    expect(role('m-owner')).toBe('admin')
    expect(fake.tables.organizations[0].owner_id).toBe(TEACHER)
    expect(fake.tables.platform_admin_actions[0].details).toMatchObject({ newOwnerEmail: 'kofi@test.com', previousOwnerId: OWNER })
  })

  it('won’t make a student, an outsider or the current owner the owner', async () => {
    await expect(server.transferSchoolOwnership(context(), SCHOOL, STUDENT, 'x')).rejects.toMatchObject({ status: 400 })
    await expect(server.transferSchoolOwnership(context(), SCHOOL, LEARNER, 'x')).rejects.toMatchObject({ status: 400 })
    await expect(server.transferSchoolOwnership(context(), SCHOOL, OWNER, 'x')).rejects.toMatchObject({ status: 409 })
    expect(fake.tables.organizations[0].owner_id).toBe(OWNER)
  })

  it('treats unknown or malformed school ids as not found', async () => {
    await expect(server.setSchoolActive(context(), 'not-a-uuid', false, 'x')).rejects.toMatchObject({ status: 404 })
    await expect(server.setSchoolActive(context(), '00000000-0000-4000-8000-0000000000ff', false, 'x')).rejects.toMatchObject({ status: 404 })
  })
})

describe('school actions route', () => {
  it('needs a reason and a valid amount', async () => {
    expect((await schoolAction(post({ action: 'grant_credits', credits: 50 }), params({ schoolId: SCHOOL }))).status).toBe(400)
    expect((await schoolAction(post({ action: 'grant_credits', credits: 0, reason: 'x' }), params({ schoolId: SCHOOL }))).status).toBe(400)
    expect((await schoolAction(post({ action: 'extend_trial', days: 365, reason: 'x' }), params({ schoolId: SCHOOL }))).status).toBe(400)
    expect((await schoolAction(post({ action: 'delete', reason: 'x' }), params({ schoolId: SCHOOL }))).status).toBe(400)
    expect(fake.rpcCalls).toEqual([])
    expect((await schoolAction(post({ action: 'grant_credits', credits: 50, reason: 'Pilot' }), params({ schoolId: SCHOOL }))).status).toBe(200)
  })

  it('is for platform admins only', async () => {
    mocks.session.mockResolvedValue({ user: { id: OWNER, role: 'learner' } })
    expect((await schoolAction(post({ action: 'suspend', reason: 'x' }), params({ schoolId: SCHOOL }))).status).toBe(403)
    expect(fake.tables.organizations[0].is_active).toBe(true)
  })
})

describe('account support actions', () => {
  it('finds accounts by name or email and role', async () => {
    const found = await server.searchUsers(fake.client, { query: 'KOFI' })
    expect(found.users.map((u) => u.email)).toEqual(['kofi@test.com'])
    const students = await server.searchUsers(fake.client, { role: 'student' })
    expect(students.users.map((u) => u.email)).toEqual(['esi@test.com'])
    expect(students.total).toBe(1)
  })

  it('blocks sign-in on deactivate and lifts it on reactivate', async () => {
    await server.setUserActive(context(), LEARNER, false, 'Abuse report')
    expect(updateUserById).toHaveBeenLastCalledWith(LEARNER, { ban_duration: '876000h' })
    expect(fake.tables.users.find((u) => u.id === LEARNER)?.isactive).toBe(false)
    await server.setUserActive(context(), LEARNER, true, 'Resolved')
    expect(updateUserById).toHaveBeenLastCalledWith(LEARNER, { ban_duration: 'none' })
  })

  it('won’t deactivate yourself or another platform admin', async () => {
    await expect(server.setUserActive(context(), ADMIN, false, 'x')).rejects.toMatchObject({ status: 409 })
    fake.tables.users.find((u) => u.id === LEARNER)!.role = 'admin'
    await expect(server.setUserActive(context(), LEARNER, false, 'x')).rejects.toMatchObject({ status: 409 })
    expect(updateUserById).not.toHaveBeenCalled()
  })

  it('gives a person bonus credits', async () => {
    const response = await userAction(post({ action: 'grant_credits', credits: 30, reason: 'Sorry for the outage' }), params({ userId: LEARNER }))
    expect(response.status).toBe(200)
    expect(fake.rpcCalls[0]).toEqual({ name: 'add_user_credits', args: expect.objectContaining({ p_user_id: LEARNER, p_amount: 30, p_type: 'bonus' }) })
  })
})

describe('overview, billing and activity', () => {
  it('flags trials ending soon, low credits and suspended schools', async () => {
    fake.tables.organizations.push(
      { id: '00000000-0000-4000-8000-0000000000a2', type: 'school', name: 'Riverside', is_active: true, credits: 10, trial_credits: 0, trial_expires_at: null, created_at: days(-60) },
      { id: '00000000-0000-4000-8000-0000000000a3', type: 'school', name: 'Closed', is_active: false, credits: 900, created_at: days(-60) },
      { id: '00000000-0000-4000-8000-0000000000a4', type: 'school', name: 'Healthy', is_active: true, credits: 900, created_at: days(-60) },
    )
    const overview = await server.getPlatformOverview(fake.client, NOW)
    expect(overview.attention.map((a) => [a.kind, a.title])).toEqual([
      ['trial_ending', 'Hilltop\'s trial ends in 3 days'],
      ['low_credits', 'Riverside is low on credits'],
      ['suspended', 'Closed is suspended'],
    ])
    expect(overview.schools).toMatchObject({ total: 4, suspended: 1 })
    expect(overview.users).toMatchObject({ total: 5, students: 1, teachers: 1, learners: 2, admins: 1 })
  })

  it('counts revenue from purchases only, at $0.10 a credit', async () => {
    fake.tables.credit_transactions = [
      { id: 't1', user_id: LEARNER, transaction_type: 'purchase', credits: 100, created_at: '2026-10-02T00:00:00Z' },
      { id: 't2', user_id: LEARNER, transaction_type: 'bonus', credits: 50, created_at: '2026-10-03T00:00:00Z' },
    ]
    fake.tables.organization_credit_transactions = [
      { id: 's1', organization_id: SCHOOL, transaction_type: 'purchase', credits: 1000, created_at: '2026-09-10T00:00:00Z' },
      { id: 's2', organization_id: SCHOOL, transaction_type: 'trial', credits: 300, created_at: '2026-09-01T00:00:00Z' },
    ]
    const billing = await server.getBilling(fake.client, NOW, 2)
    expect(billing.months).toEqual([
      { month: '2026-09', dollars: 100, credits: 1000, schoolDollars: 100, personDollars: 0, granted: 300 },
      { month: '2026-10', dollars: 10, credits: 100, schoolDollars: 0, personDollars: 10, granted: 50 },
    ])
    expect(billing.totals).toEqual({ dollars: 110, credits: 1100, granted: 350, purchases: 2 })
  })

  it('shows an empty log before the activity table exists', async () => {
    const missing = { from: () => ({ select: () => ({ order: () => ({ limit: async () => ({ data: null, error: { code: '42P01' } }) }) }) }) }
    expect(await server.listActivity(missing as never)).toEqual([])
  })
})
