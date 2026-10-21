import { describe, expect, it } from 'vitest'
import { resetLinkFromTokenHash, validateNewPassword } from '@/lib/password-reset'
import { buildPasswordResetEmail } from '@/lib/password-reset-email'
import { adminPromotionProblem } from '@/lib/platform-admin'

describe('password reset helpers', () => {
  it('builds a reset link the page can verify in any browser', () => {
    expect(resetLinkFromTokenHash('https://insyte.test/', 'abc 123')).toBe('https://insyte.test/reset-password?token_hash=abc+123&type=recovery')
  })

  it('checks the new password', () => {
    expect(validateNewPassword('short', 'short')).toMatch(/at least 8/)
    expect(validateNewPassword('long enough', 'different')).toMatch(/do not match/)
    expect(validateNewPassword('long enough', 'long enough')).toBeNull()
  })

  it('escapes the name in the email', () => {
    const email = buildPasswordResetEmail({ name: '<b>Ama</b>', url: 'https://insyte.test/reset-password?token_hash=x&type=recovery' })
    expect(email.html).toContain('&lt;b&gt;Ama&lt;/b&gt;')
    expect(email.html).toContain('token_hash=x&amp;type=recovery')
    expect(email.text).toContain('https://insyte.test/reset-password?token_hash=x&type=recovery')
  })
})

describe('adminPromotionProblem', () => {
  it('only promotes normal accounts', () => {
    expect(adminPromotionProblem('learner')).toBeNull()
    expect(adminPromotionProblem(null)).toBeNull()
    expect(adminPromotionProblem('admin')).toMatch(/already/)
    expect(adminPromotionProblem('teacher')).toMatch(/teacher or student/)
    expect(adminPromotionProblem('student')).toMatch(/teacher or student/)
  })
})
