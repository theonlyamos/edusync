import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createSchoolInvites,
  generateJoinCode,
  hashInviteToken,
  InviteLimitError,
  resendSchoolInvite,
} from '@/lib/school-invites.server'
import { JOIN_CODE_ALPHABET, type Invite } from '@/lib/school-invites'
import { fakeSupabase } from './helpers/fake-supabase'

const school = { id: 'school-1', name: 'Hilltop', owner_id: 'owner-1', total_credits_purchased: 0 }
const context = (supabase: any) => ({ supabase, school, inviter: { id: 'owner-1', name: 'Mrs Owusu' }, origin: 'https://app.test' })
const teacher = (email: string): Invite => ({ email, name: null, role: 'teacher', gradeLevel: null })

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('invite tokens and codes', () => {
  it('hashes tokens the same way as the database (SHA-256 hex)', () => {
    expect(hashInviteToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('makes codes from the easy-to-read alphabet', () => {
    const code = generateJoinCode()
    expect(code).toHaveLength(8)
    expect([...code].every((ch) => JOIN_CODE_ALPHABET.includes(ch))).toBe(true)
  })
})

describe('createSchoolInvites', () => {
  it('skips members, refreshes open invites and saves only token hashes', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    const fake = fakeSupabase({
      users: [{ id: 'u-member', email: 'member@example.com' }],
      organization_members: [{ organization_id: 'school-1', user_id: 'u-member', is_active: true }],
      organization_invitations: [
        { id: 'old', organization_id: 'school-1', email: 'again@example.com', role: 'student', grade_level: 'primary 1', token: 'old-hash', accepted_at: null, revoked_at: null, last_sent_at: '2026-10-20T10:00:00Z' },
      ],
      credit_transactions: [],
    })

    const results = await createSchoolInvites(context(fake.client), [
      teacher('member@example.com'),
      teacher('new@example.com'),
      teacher('again@example.com'),
    ])

    expect(results.map((r) => [r.email, r.outcome, r.emailed])).toEqual([
      ['member@example.com', 'skipped', false],
      ['new@example.com', 'invited', false],
      ['again@example.com', 'invited', false],
    ])
    const invites = fake.tables.organization_invitations
    expect(invites).toHaveLength(2)
    const fresh = invites.find((i) => i.email === 'new@example.com')!
    const token = decodeURIComponent(results[1].inviteUrl!.split('/join/')[1])
    expect(fresh.token).toBe(hashInviteToken(token))
    expect(fresh.token).not.toBe(token)
    const refreshed = invites.find((i) => i.id === 'old')!
    // The new link has not been emailed, so it no longer counts as sent.
    expect(refreshed).toMatchObject({ role: 'teacher', grade_level: null, last_sent_at: null })
    expect(refreshed.token).not.toBe('old-hash')
    expect(fake.rpcCalls).toEqual([])
  })

  it('caps invites before the school has bought credits', async () => {
    const existing = Array.from({ length: 99 }, (_, i) => ({ id: `i${i}`, organization_id: 'school-1', email: `p${i}@example.com`, revoked_at: null, accepted_at: null }))
    const fake = fakeSupabase({ users: [], organization_members: [], organization_invitations: existing, credit_transactions: [] })
    await expect(
      createSchoolInvites(context(fake.client), [teacher('a@example.com'), teacher('b@example.com')]),
    ).rejects.toBeInstanceOf(InviteLimitError)

    const paid = fakeSupabase({ users: [], organization_members: [], organization_invitations: [...existing], credit_transactions: [] })
    const results = await createSchoolInvites(
      { ...context(paid.client), school: { ...school, total_credits_purchased: 50 } },
      [teacher('a@example.com'), teacher('b@example.com')],
    )
    expect(results.every((r) => r.outcome === 'invited')).toBe(true)
  })

  it('emails invites through Resend and records the send', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test')
    vi.stubEnv('EMAIL_FROM', 'InsyteAI <invites@example.com>')
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body))
      return new Response(JSON.stringify({ data: body.map((_: unknown, i: number) => ({ id: `e${i}` })) }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const fake = fakeSupabase({ users: [], organization_members: [], organization_invitations: [], credit_transactions: [] })

    const results = await createSchoolInvites(context(fake.client), [teacher('a@example.com'), teacher('b@example.com')])

    expect(results.every((r) => r.emailed && r.inviteUrl === undefined)).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.resend.com/emails/batch')
    const sent = JSON.parse(String(fetchMock.mock.calls[0][1].body))
    expect(sent[0]).toMatchObject({ from: 'InsyteAI <invites@example.com>', to: ['a@example.com'], subject: 'Join Hilltop on InsyteAI' })
    expect(sent[0].text).toContain('https://app.test/join/')
    expect(fake.rpcCalls).toEqual([
      { name: 'mark_school_invites_sent', args: expect.objectContaining({ p_organization_id: 'school-1', p_emails: ['a@example.com', 'b@example.com'] }) },
    ])
  })
})

describe('resendSchoolInvite', () => {
  it('rotates the link of an open invite and refuses closed ones', async () => {
    const fake = fakeSupabase({
      organization_invitations: [
        { id: 'open', organization_id: 'school-1', email: 'a@example.com', role: 'teacher', token: 'h1', accepted_at: null, revoked_at: null, last_sent_at: '2026-10-20T10:00:00Z' },
        { id: 'done', organization_id: 'school-1', email: 'b@example.com', role: 'teacher', token: 'h2', accepted_at: '2026-10-20', revoked_at: null },
        { id: 'other', organization_id: 'school-2', email: 'c@example.com', role: 'teacher', token: 'h3', accepted_at: null, revoked_at: null },
      ],
    })
    const result = await resendSchoolInvite(context(fake.client), 'open')
    expect(result?.outcome).toBe('invited')
    expect(fake.tables.organization_invitations[0].token).toBe(hashInviteToken(decodeURIComponent(result!.inviteUrl!.split('/join/')[1])))
    expect(fake.tables.organization_invitations[0].last_sent_at).toBeNull()
    expect(await resendSchoolInvite(context(fake.client), 'done')).toBeNull()
    expect(await resendSchoolInvite(context(fake.client), 'other')).toBeNull()
  })
})
