import { GRADE_LEVELS } from '@/lib/constants'

/** Roles a school owner or admin can invite someone into. */
export const INVITE_ROLES = ['teacher', 'student', 'admin'] as const
export type InviteRole = (typeof INVITE_ROLES)[number]

/** How long an invite link works after it was last sent. */
export const INVITE_TTL_DAYS = 7
/** Invites a school can send before it has bought any credits. */
export const INVITES_BEFORE_FIRST_PURCHASE = 100
/** Most rows one request (one CSV file) may send. */
export const MAX_INVITES_PER_REQUEST = 500

export type InviteInput = {
  email?: unknown
  name?: unknown
  role?: unknown
  gradeLevel?: unknown
}

export type Invite = {
  email: string
  name: string | null
  role: InviteRole
  gradeLevel: string | null
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

export function normalizeEmail(value: unknown): string {
  return text(value).toLowerCase()
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && EMAIL_PATTERN.test(email)
}

export function parseInviteRole(value: unknown): InviteRole | null {
  const role = text(value).toLowerCase()
  return (INVITE_ROLES as readonly string[]).includes(role) ? (role as InviteRole) : null
}

/**
 * Reads a grade the way people type it in a spreadsheet: "Primary 1", "P1",
 * "JHS1", "jhs 1". Returns the app's grade value, or null when it is not one.
 */
export function normalizeGradeLevel(value: unknown): string | null {
  const raw = text(value).toLowerCase().replace(/[\s_-]+/g, ' ')
  if (!raw) return null
  const match = raw.match(/^(primary|p|basic|jhs|shs)\s?(\d{1,2})$/)
  const grade = match
    ? `${match[1] === 'p' || match[1] === 'basic' ? 'primary' : match[1]} ${Number(match[2])}`
    : raw
  return (GRADE_LEVELS as readonly string[]).includes(grade) ? grade : null
}

/**
 * Checks one invite. When the school has picked its grades, a student's grade
 * must be one of them.
 */
export function validateInvite(input: InviteInput, schoolGrades: readonly string[] = []): Result<Invite> {
  const email = normalizeEmail(input.email)
  if (!isValidEmail(email)) return { ok: false, error: 'Enter a valid email address.' }

  const name = text(input.name)
  if (name.length > 120) return { ok: false, error: 'Name must be 120 characters or fewer.' }

  const role = parseInviteRole(input.role)
  if (!role) return { ok: false, error: 'Role must be teacher, student or admin.' }

  let gradeLevel: string | null = null
  if (role === 'student') {
    gradeLevel = normalizeGradeLevel(input.gradeLevel)
    if (!gradeLevel) return { ok: false, error: 'Pick a grade for this student.' }
    if (schoolGrades.length > 0 && !schoolGrades.includes(gradeLevel)) {
      return { ok: false, error: 'That grade is not one of your school’s grades.' }
    }
  }

  return { ok: true, value: { email, name: name || null, role, gradeLevel } }
}

/** Splits CSV text into rows of cells. Handles quoted cells, "" escapes and CRLF. */
export function parseCsv(input: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const source = input.replace(/^﻿/, '')

  for (let i = 0; i < source.length; i++) {
    const ch = source[i]
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') {
        quoted = false
      } else {
        cell += ch
      }
    } else if (ch === '"') {
      quoted = true
    } else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && source[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += ch
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((cells) => cells.some((c) => c.trim() !== ''))
}

export type CsvInviteRow = {
  /** Line number in the file, counting the header. */
  line: number
  input: { name: string; email: string; role: string; grade: string }
  invite: Invite | null
  error: string | null
}

const HEADER_NAMES: Record<string, keyof CsvInviteRow['input']> = {
  name: 'name',
  'full name': 'name',
  email: 'email',
  'email address': 'email',
  role: 'role',
  grade: 'grade',
  'grade level': 'grade',
  class: 'grade',
}

/**
 * Reads a CSV of people to invite: name, email, role, grade. A header row is
 * optional; with one, the columns may come in any order.
 */
export function parseInviteCsv(csv: string, schoolGrades: readonly string[] = []): { rows: CsvInviteRow[]; error: string | null } {
  const cells = parseCsv(csv)
  if (cells.length === 0) return { rows: [], error: 'The file is empty.' }

  const first = cells[0].map((c) => c.trim().toLowerCase())
  const hasHeader = first.includes('email') || first.includes('email address')
  let columns: Array<keyof CsvInviteRow['input'] | null> = ['name', 'email', 'role', 'grade']
  if (hasHeader) {
    columns = first.map((c) => HEADER_NAMES[c] ?? null)
  }
  const body = hasHeader ? cells.slice(1) : cells
  if (body.length === 0) return { rows: [], error: 'The file has no people in it.' }
  if (body.length > MAX_INVITES_PER_REQUEST) {
    return { rows: [], error: `Send at most ${MAX_INVITES_PER_REQUEST} invites per file.` }
  }

  const seen = new Set<string>()
  const rows = body.map((cellsInRow, index): CsvInviteRow => {
    const input = { name: '', email: '', role: '', grade: '' }
    columns.forEach((column, i) => {
      if (column) input[column] = (cellsInRow[i] ?? '').trim()
    })
    const line = index + (hasHeader ? 2 : 1)
    const checked = validateInvite(
      { email: input.email, name: input.name, role: input.role, gradeLevel: input.grade },
      schoolGrades,
    )
    if (!checked.ok) return { line, input, invite: null, error: checked.error }
    if (seen.has(checked.value.email)) {
      return { line, input, invite: null, error: 'This email is already in the file.' }
    }
    seen.add(checked.value.email)
    return { line, input, invite: checked.value, error: null }
  })
  return { rows, error: null }
}

export type InviteState = 'pending' | 'expired' | 'accepted' | 'revoked'

export function inviteState(
  invite: { accepted_at?: string | null; revoked_at?: string | null; expires_at: string },
  now: Date = new Date(),
): InviteState {
  if (invite.accepted_at) return 'accepted'
  if (invite.revoked_at) return 'revoked'
  return new Date(invite.expires_at).getTime() < now.getTime() ? 'expired' : 'pending'
}

/** Letters and digits that are hard to mix up when read aloud or off a board. */
export const JOIN_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const JOIN_CODE_LENGTH = 8

/** "hill-2345 " -> "HILL2345". */
export function normalizeJoinCode(value: unknown): string {
  return text(value).toUpperCase().replace(/[\s-]+/g, '')
}

export function isJoinCodeFormat(code: string): boolean {
  return /^[A-Z0-9]{6,12}$/.test(code)
}

export function inviteRoleLabel(role: string): string {
  if (role === 'admin') return 'School admin'
  if (role === 'teacher') return 'Teacher'
  if (role === 'student') return 'Student'
  return role
}

/** Errors the invite and join-code database functions raise on purpose, as HTTP statuses. */
export function schoolJoinErrorStatus(code: string | undefined): number | null {
  if (code === '42501') return 403
  if (code === '22023') return 400
  if (code === 'P0002') return 404
  if (code === 'P0001' || code === '23505') return 409
  return null
}

/** Where someone lands after joining a school with this role. */
export function homeForSchoolRole(role: string, schoolId: string): string {
  if (role === 'teacher') return '/teachers/dashboard'
  if (role === 'student') return '/students/dashboard'
  return `/learn/org/${schoolId}`
}
