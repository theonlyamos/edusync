import { GRADE_LEVELS } from '@/lib/constants'

export type SchoolDetailsInput = {
  name?: unknown
  country?: unknown
  timezone?: unknown
  gradeLevels?: unknown
}

export type SchoolDetails = {
  name?: string
  country?: string | null
  timezone?: string | null
  gradeLevels?: string[]
}

type Result = { ok: true; value: SchoolDetails } | { ok: false; error: string }

const optionalText = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return true
  } catch {
    return false
  }
}

/**
 * Checks the school details a person typed. With `partial`, missing fields are
 * left out (for updates); otherwise a school name is required.
 */
export function parseSchoolDetails(input: SchoolDetailsInput, { partial = false } = {}): Result {
  const value: SchoolDetails = {}

  if (input.name !== undefined || !partial) {
    const name = optionalText(input.name)
    if (name.length < 2 || name.length > 120) return { ok: false, error: 'School name must be 2 to 120 characters.' }
    value.name = name
  }

  if (input.country !== undefined) {
    const country = optionalText(input.country)
    if (country.length > 80) return { ok: false, error: 'Country must be 80 characters or fewer.' }
    value.country = country || null
  }

  if (input.timezone !== undefined) {
    const timezone = optionalText(input.timezone)
    if (timezone && (timezone.length > 64 || !isValidTimeZone(timezone))) {
      return { ok: false, error: 'Pick a valid time zone.' }
    }
    value.timezone = timezone || null
  }

  if (input.gradeLevels !== undefined) {
    if (!Array.isArray(input.gradeLevels)) return { ok: false, error: 'Grades must be a list.' }
    const allowed = new Set<string>(GRADE_LEVELS)
    const picked = new Set<string>()
    for (const grade of input.gradeLevels) {
      if (typeof grade !== 'string' || !allowed.has(grade)) return { ok: false, error: `Unknown grade: ${String(grade)}` }
      picked.add(grade)
    }
    // Keep the school's grades in the app's usual order.
    value.gradeLevels = GRADE_LEVELS.filter((grade) => picked.has(grade))
  }

  return { ok: true, value }
}

export type SchoolSetupProgress = {
  hasDetails: boolean
  gradeCount: number
  teacherCount: number
  studentCount: number
  hasPurchasedCredits: boolean
}

export type SchoolSetupStepId = 'details' | 'grades' | 'people' | 'credits'

export type SchoolSetupStep = {
  id: SchoolSetupStepId
  title: string
  done: boolean
}

export function schoolSetupSteps(progress: SchoolSetupProgress): SchoolSetupStep[] {
  return [
    { id: 'details', title: 'Add your school details', done: progress.hasDetails },
    { id: 'grades', title: 'Choose the grades you teach', done: progress.gradeCount > 0 },
    { id: 'people', title: 'Invite teachers and students', done: progress.teacherCount > 0 && progress.studentCount > 0 },
    { id: 'credits', title: 'Buy credits for tutor minutes', done: progress.hasPurchasedCredits },
  ]
}

/** Errors register_school() raises on purpose, mapped to an HTTP status. */
export function registerSchoolErrorStatus(code: string | undefined): number | null {
  if (code === '42501') return 403
  if (code === '22023') return 400
  if (code === 'P0001' || code === '23505') return 409
  return null
}

/** 'primary 1' -> 'Primary 1', 'jhs 2' -> 'JHS 2'. */
export function gradeLevelLabel(level: string): string {
  const [stage, ...rest] = level.split(' ')
  const name = stage === 'jhs' || stage === 'shs' ? stage.toUpperCase() : stage.charAt(0).toUpperCase() + stage.slice(1)
  return [name, ...rest].join(' ')
}
