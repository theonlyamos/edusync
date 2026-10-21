/** Shared bits of the password reset flow (browser-safe). */

export const MIN_PASSWORD_LENGTH = 8

export const RESET_PASSWORD_PATH = '/reset-password'

/** Link sent by a platform admin: the reset page verifies the token itself, so it works in any browser. */
export function resetLinkFromTokenHash(origin: string, tokenHash: string): string {
  const params = new URLSearchParams({ token_hash: tokenHash, type: 'recovery' })
  return `${origin.replace(/\/+$/, '')}${RESET_PASSWORD_PATH}?${params}`
}

/** Returns an error message, or null when the new password is fine. */
export function validateNewPassword(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`
  if (password.length > 72) return 'Use 72 characters or fewer.'
  if (password !== confirm) return 'The two passwords do not match.'
  return null
}
