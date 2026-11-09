import { describe, expect, it } from 'vitest'
import { assuranceLevel, cleanCode, hasSecondStep, secondStepPending } from '@/lib/mfa'

const token = (payload: object) => `h.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.s`

describe('two-step sign-in', () => {
  it('counts only a finished authenticator setup', () => {
    expect(hasSecondStep(undefined)).toBe(false)
    expect(hasSecondStep([])).toBe(false)
    expect(hasSecondStep([{ status: 'unverified' }])).toBe(false)
    expect(hasSecondStep([{ status: 'unverified' }, { status: 'verified' }])).toBe(true)
  })

  it('reads how far a sign-in got from its token', () => {
    expect(assuranceLevel(token({ aal: 'aal1' }))).toBe('aal1')
    expect(assuranceLevel(token({ aal: 'aal2' }))).toBe('aal2')
    expect(assuranceLevel(token({}))).toBeNull()
    expect(assuranceLevel('garbage')).toBeNull()
    expect(assuranceLevel('a.%%%.c')).toBeNull()
    expect(assuranceLevel(null)).toBeNull()
  })

  it('holds a password-only session back when a code is required', () => {
    const on = [{ status: 'verified' }]
    expect(secondStepPending(on, token({ aal: 'aal1' }))).toBe(true)
    expect(secondStepPending(on, undefined)).toBe(true)
    expect(secondStepPending(on, 'garbage')).toBe(true)
    expect(secondStepPending(on, token({ aal: 'aal2' }))).toBe(false)
    expect(secondStepPending([], token({ aal: 'aal1' }))).toBe(false)
    expect(secondStepPending([{ status: 'unverified' }], token({ aal: 'aal1' }))).toBe(false)
  })

  it('keeps six digits of a typed code', () => {
    expect(cleanCode(' 12 34-56 78')).toBe('123456')
    expect(cleanCode('abc')).toBe('')
  })
})
