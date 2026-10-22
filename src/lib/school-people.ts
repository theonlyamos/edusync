import { GRADE_LEVELS } from '@/lib/constants'

/** The people a school manages, each on their own page. */
export const SCHOOL_PERSON_ROLES = ['student', 'teacher', 'admin'] as const
export type SchoolPersonRole = (typeof SCHOOL_PERSON_ROLES)[number]

/** How long an activation (or password) link works after it was sent. */
export const ACTIVATION_TTL_DAYS = 7
/** Accounts a school can create before it has bought any credits. */
export const PEOPLE_BEFORE_FIRST_PURCHASE = 100
/** Most people one CSV file may add. */
export const MAX_PEOPLE_PER_IMPORT = 500
/** People added per request while importing a CSV (the browser sends the file in parts). */
export const IMPORT_BATCH_SIZE = 20

export const MAX_SUBJECTS = 20

export type PersonInput = {
  name?: unknown
  email?: unknown
  gradeLevel?: unknown
  guardianName?: unknown
  guardianContact?: unknown
  dateOfBirth?: unknown
  subjects?: unknown
  grades?: unknown
}

export type NewPerson = {
  role: SchoolPersonRole
  name: string
  email: string
  /** Students only. */
  gradeLevel: string | null
  guardianName: string | null
  guardianContact: string | null
  dateOfBirth: string | null
  /** Teachers only. */
  subjects: string[]
  grades: string[]
}

export type PersonUpdate = Partial<Omit<NewPerson, 'role'>>

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

export function normalizeEmail(value: unknown): string {
  return text(value).toLowerCase()
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && EMAIL_PATTERN.test(email)
}

export function parsePersonRole(value: unknown): SchoolPersonRole | null {
  const role = text(value).toLowerCase()
  if (role === 'administrator') return 'admin'
  return (SCHOOL_PERSON_ROLES as readonly string[]).includes(role) ? (role as SchoolPersonRole) : null
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

/** "Maths; Science, English" or a list -> trimmed, de-duplicated subjects. */
export function parseSubjects(value: unknown): string[] | null {
  const items = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[;,|]/) : value == null ? [] : null
  if (!items) return null
  const seen = new Map<string, string>()
  for (const item of items) {
    if (typeof item !== 'string') return null
    const subject = item.trim().replace(/\s+/g, ' ')
    if (!subject) continue
    if (subject.length > 60) return null
    if (!seen.has(subject.toLowerCase())) seen.set(subject.toLowerCase(), subject)
  }
  const subjects = [...seen.values()]
  return subjects.length > MAX_SUBJECTS ? null : subjects
}

/** A list (or "JHS 1; JHS 2") of grades -> app grade values in the usual order. */
export function parseGradeList(value: unknown): string[] | null {
  const items = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[;,|]/) : value == null ? [] : null
  if (!items) return null
  const picked = new Set<string>()
  for (const item of items) {
    if (typeof item === 'string' && !item.trim()) continue
    const grade = normalizeGradeLevel(item)
    if (!grade) return null
    picked.add(grade)
  }
  return GRADE_LEVELS.filter((grade) => picked.has(grade))
}

/** YYYY-MM-DD in the past, or null when empty. Returns undefined when invalid. */
export function parseDateOfBirth(value: unknown): string | null | undefined {
  const raw = text(value)
  if (!raw) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined
  const date = new Date(`${raw}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw) return undefined
  if (date.getTime() > Date.now() || date.getUTCFullYear() < 1900) return undefined
  return raw
}

function checkName(value: unknown): Result<string> {
  const name = text(value).replace(/\s+/g, ' ')
  if (name.length < 2 || name.length > 120) return { ok: false, error: 'Enter a name (2 to 120 characters).' }
  return { ok: true, value: name }
}

function checkOptionalText(value: unknown, label: string): Result<string | null> {
  const v = text(value)
  if (v.length > 120) return { ok: false, error: `${label} must be 120 characters or fewer.` }
  return { ok: true, value: v || null }
}

function checkStudentGrade(value: unknown, schoolGrades: readonly string[]): Result<string> {
  const grade = normalizeGradeLevel(value)
  if (!grade) return { ok: false, error: 'Pick a grade for this student.' }
  if (schoolGrades.length > 0 && !schoolGrades.includes(grade)) {
    return { ok: false, error: 'That grade is not one of your school’s grades.' }
  }
  return { ok: true, value: grade }
}

/**
 * Checks the details of someone a school admin is adding. When the school has
 * picked its grades, a student's grade must be one of them.
 */
export function validateNewPerson(role: SchoolPersonRole, input: PersonInput, schoolGrades: readonly string[] = []): Result<NewPerson> {
  const name = checkName(input.name)
  if (!name.ok) return name
  const email = normalizeEmail(input.email)
  if (!isValidEmail(email)) return { ok: false, error: 'Enter a valid email address.' }

  const person: NewPerson = {
    role,
    name: name.value,
    email,
    gradeLevel: null,
    guardianName: null,
    guardianContact: null,
    dateOfBirth: null,
    subjects: [],
    grades: [],
  }

  if (role === 'student') {
    const grade = checkStudentGrade(input.gradeLevel, schoolGrades)
    if (!grade.ok) return grade
    person.gradeLevel = grade.value
    const guardianName = checkOptionalText(input.guardianName, 'Guardian name')
    if (!guardianName.ok) return guardianName
    const guardianContact = checkOptionalText(input.guardianContact, 'Guardian contact')
    if (!guardianContact.ok) return guardianContact
    const dob = parseDateOfBirth(input.dateOfBirth)
    if (dob === undefined) return { ok: false, error: 'Date of birth must be a past date (YYYY-MM-DD).' }
    person.guardianName = guardianName.value
    person.guardianContact = guardianContact.value
    person.dateOfBirth = dob
  } else if (role === 'teacher') {
    const subjects = parseSubjects(input.subjects)
    if (!subjects) return { ok: false, error: `List up to ${MAX_SUBJECTS} subjects, each up to 60 characters.` }
    const grades = parseGradeList(input.grades)
    if (!grades) return { ok: false, error: 'One of the grades is not a grade this app knows.' }
    person.subjects = subjects
    person.grades = grades
  }
  return { ok: true, value: person }
}

/** Checks an edit. Only fields that are present change; fields that don't apply to the role are refused. */
export function validatePersonUpdate(role: SchoolPersonRole, input: PersonInput, schoolGrades: readonly string[] = []): Result<PersonUpdate> {
  const update: PersonUpdate = {}
  if (input.name !== undefined) {
    const name = checkName(input.name)
    if (!name.ok) return name
    update.name = name.value
  }
  if (input.email !== undefined) {
    const email = normalizeEmail(input.email)
    if (!isValidEmail(email)) return { ok: false, error: 'Enter a valid email address.' }
    update.email = email
  }
  const studentOnly = [input.gradeLevel, input.guardianName, input.guardianContact, input.dateOfBirth].some((v) => v !== undefined)
  const teacherOnly = [input.subjects, input.grades].some((v) => v !== undefined)
  if (studentOnly && role !== 'student') return { ok: false, error: 'Only students have a grade, guardian or date of birth.' }
  if (teacherOnly && role !== 'teacher') return { ok: false, error: 'Only teachers have subjects and grades they teach.' }

  if (input.gradeLevel !== undefined) {
    const grade = checkStudentGrade(input.gradeLevel, schoolGrades)
    if (!grade.ok) return grade
    update.gradeLevel = grade.value
  }
  if (input.guardianName !== undefined) {
    const v = checkOptionalText(input.guardianName, 'Guardian name')
    if (!v.ok) return v
    update.guardianName = v.value
  }
  if (input.guardianContact !== undefined) {
    const v = checkOptionalText(input.guardianContact, 'Guardian contact')
    if (!v.ok) return v
    update.guardianContact = v.value
  }
  if (input.dateOfBirth !== undefined) {
    const dob = parseDateOfBirth(input.dateOfBirth)
    if (dob === undefined) return { ok: false, error: 'Date of birth must be a past date (YYYY-MM-DD).' }
    update.dateOfBirth = dob
  }
  if (input.subjects !== undefined) {
    const subjects = parseSubjects(input.subjects)
    if (!subjects) return { ok: false, error: `List up to ${MAX_SUBJECTS} subjects, each up to 60 characters.` }
    update.subjects = subjects
  }
  if (input.grades !== undefined) {
    const grades = parseGradeList(input.grades)
    if (!grades) return { ok: false, error: 'One of the grades is not a grade this app knows.' }
    update.grades = grades
  }
  if (Object.keys(update).length === 0) return { ok: false, error: 'Nothing to change.' }
  return { ok: true, value: update }
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

type CsvField = keyof PersonInput

const HEADER_NAMES: Record<string, CsvField> = {
  name: 'name',
  'full name': 'name',
  email: 'email',
  'email address': 'email',
  grade: 'gradeLevel',
  'grade level': 'gradeLevel',
  class: 'gradeLevel',
  guardian: 'guardianName',
  'guardian name': 'guardianName',
  parent: 'guardianName',
  'parent name': 'guardianName',
  'guardian contact': 'guardianContact',
  'guardian phone': 'guardianContact',
  'parent contact': 'guardianContact',
  'parent phone': 'guardianContact',
  'date of birth': 'dateOfBirth',
  dob: 'dateOfBirth',
  birthday: 'dateOfBirth',
  subjects: 'subjects',
  subject: 'subjects',
  grades: 'grades',
  'grades taught': 'grades',
}

/** The columns a CSV without a header row is read as, per role. */
export const CSV_DEFAULT_COLUMNS: Record<SchoolPersonRole, CsvField[]> = {
  student: ['name', 'email', 'gradeLevel', 'guardianName', 'guardianContact', 'dateOfBirth'],
  teacher: ['name', 'email', 'subjects', 'grades'],
  admin: ['name', 'email'],
}

/** A header row people can copy into a spreadsheet. */
export const CSV_TEMPLATES: Record<SchoolPersonRole, string> = {
  student: 'name,email,grade,guardian name,guardian contact,date of birth\nAma Mensah,ama@example.com,JHS 1,Kofi Mensah,+233 20 000 0000,2012-04-18\n',
  teacher: 'name,email,subjects,grades\nYaw Boateng,yaw@example.com,Mathematics; Science,JHS 1; JHS 2\n',
  admin: 'name,email\nEfua Owusu,efua@example.com\n',
}

export type CsvPersonRow = {
  /** Line number in the file, counting the header. */
  line: number
  name: string
  email: string
  person: NewPerson | null
  error: string | null
}

/**
 * Reads a CSV of people to add with one role. A header row is optional; with
 * one, the columns may come in any order.
 */
export function parsePeopleCsv(
  csv: string,
  role: SchoolPersonRole,
  schoolGrades: readonly string[] = [],
): { rows: CsvPersonRow[]; error: string | null } {
  const cells = parseCsv(csv)
  if (cells.length === 0) return { rows: [], error: 'The file is empty.' }

  const first = cells[0].map((c) => c.trim().toLowerCase())
  const hasHeader = first.includes('email') || first.includes('email address')
  const columns: Array<CsvField | null> = hasHeader ? first.map((c) => HEADER_NAMES[c] ?? null) : CSV_DEFAULT_COLUMNS[role]
  const body = hasHeader ? cells.slice(1) : cells
  if (body.length === 0) return { rows: [], error: 'The file has no people in it.' }
  if (body.length > MAX_PEOPLE_PER_IMPORT) {
    return { rows: [], error: `Add at most ${MAX_PEOPLE_PER_IMPORT} people per file.` }
  }

  const seen = new Set<string>()
  const rows = body.map((cellsInRow, index): CsvPersonRow => {
    const input: Record<string, string> = {}
    columns.forEach((column, i) => {
      if (column) input[column] = (cellsInRow[i] ?? '').trim()
    })
    const line = index + (hasHeader ? 2 : 1)
    const base = { line, name: input.name ?? '', email: input.email ?? '' }
    const checked = validateNewPerson(role, input, schoolGrades)
    if (!checked.ok) return { ...base, person: null, error: checked.error }
    if (seen.has(checked.value.email)) return { ...base, person: null, error: 'This email is already in the file.' }
    seen.add(checked.value.email)
    return { ...base, person: checked.value, error: null }
  })
  return { rows, error: null }
}

export function schoolRoleLabel(role: string): string {
  if (role === 'owner') return 'Owner'
  if (role === 'admin') return 'Administrator'
  if (role === 'teacher') return 'Teacher'
  if (role === 'student') return 'Student'
  return role
}

/** Errors the school database functions raise on purpose, as HTTP statuses. */
export function schoolDbErrorStatus(code: string | undefined): number | null {
  if (code === '42501') return 403
  if (code === '22023') return 400
  if (code === 'P0002') return 404
  if (code === 'P0001' || code === '23505') return 409
  return null
}

/** A person's account state, as the people pages show it. */
export type AccountStatus = 'active' | 'pending' | 'link_expired' | 'deactivated'

/**
 * Accounts made by a school admin start with an activation link. Someone is
 * activated once any of their links was used (password links are only sent
 * to activated people). People who joined before links existed have none.
 */
export function accountStatus(
  member: { is_active: boolean },
  links: Array<{ accepted_at: string | null; revoked_at: string | null; expires_at: string }>,
  now: Date = new Date(),
): AccountStatus {
  if (!member.is_active) return 'deactivated'
  if (links.length === 0 || links.some((link) => link.accepted_at)) return 'active'
  const open = links.some((link) => !link.revoked_at && new Date(link.expires_at).getTime() >= now.getTime())
  return open ? 'pending' : 'link_expired'
}

export const ACCOUNT_STATUS_LABEL: Record<AccountStatus, string> = {
  active: 'Active',
  pending: 'Not activated yet',
  link_expired: 'Activation link expired',
  deactivated: 'Deactivated',
}

/** Where someone lands after activating their account. */
export function homeForSchoolRole(role: string): string {
  if (role === 'teacher') return '/teachers/dashboard'
  if (role === 'student') return '/students/dashboard'
  return '/school/dashboard'
}

/** Quotes a CSV cell and defuses spreadsheet formulas. */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}
