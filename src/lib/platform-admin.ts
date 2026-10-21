/** Rules for platform support accounts (browser-safe). */

/** Why an account cannot be made a platform admin, or null when it can. */
export function adminPromotionProblem(role: string | null | undefined): string | null {
  if (role === 'admin') return 'That account is already a platform admin.'
  if (role === 'teacher' || role === 'student') {
    return 'That is a teacher or student account. Use a separate account for support work.'
  }
  return null
}
