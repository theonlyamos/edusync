/** A school's subject list and who teaches what. Shared by the server and the school pages. */

export const MAX_SUBJECT_NAME = 60
export const MAX_SUBJECT_CODE = 10
export const MAX_SUBJECTS_PER_SCHOOL = 80

export type SchoolSubject = {
  id: string
  name: string
  code: string | null
  color: string | null
  /** Grades that take it; empty means every grade. */
  grades: string[]
  archived: boolean
}

export type SubjectTeacherAssignment = {
  id: string
  subjectId: string
  grade: string
  /** Null means the whole grade. */
  classId: string | null
  teacherId: string
}

/** A starting list for Ghanaian basic schools (GES). Admins can change it. */
export const STANDARD_SUBJECTS: Array<{ name: string; code: string; color: string }> = [
  { name: 'Mathematics', code: 'MATH', color: '#2563eb' },
  { name: 'English Language', code: 'ENG', color: '#dc2626' },
  { name: 'Integrated Science', code: 'SCI', color: '#16a34a' },
  { name: 'Social Studies', code: 'SOC', color: '#ca8a04' },
  { name: 'Religious and Moral Education', code: 'RME', color: '#9333ea' },
  { name: 'Computing', code: 'ICT', color: '#0891b2' },
  { name: 'French', code: 'FRE', color: '#db2777' },
  { name: 'Ghanaian Language', code: 'GHL', color: '#ea580c' },
  { name: 'Career Technology', code: 'CTE', color: '#65a30d' },
  { name: 'Creative Arts and Design', code: 'CAD', color: '#c026d3' },
  { name: 'Physical Education', code: 'PE', color: '#0d9488' },
]

/** Swatches for the colour picker. */
export const SUBJECT_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#ca8a04', '#9333ea', '#0891b2', '#db2777', '#ea580c', '#65a30d', '#c026d3', '#0d9488', '#64748b']

const squash = (value: string) => value.replace(/\s+/g, ' ').trim()

export type SubjectInput = { name?: unknown; code?: unknown; color?: unknown; grades?: unknown }
export type CleanSubject = { name?: string; code?: string | null; color?: string | null; grades?: string[] }

/** Checks a new or edited subject. Only the fields given are checked and returned. */
export function validateSubject(input: SubjectInput, schoolGrades: readonly string[], requireName: boolean): { ok: true; value: CleanSubject } | { ok: false; error: string } {
  const value: CleanSubject = {}
  if (input.name !== undefined || requireName) {
    if (typeof input.name !== 'string' || !squash(input.name)) return { ok: false, error: 'Give the subject a name' }
    const name = squash(input.name)
    if (name.length > MAX_SUBJECT_NAME) return { ok: false, error: `Keep the name under ${MAX_SUBJECT_NAME} characters` }
    value.name = name
  }
  if (input.code !== undefined) {
    if (input.code === null || input.code === '') value.code = null
    else if (typeof input.code !== 'string') return { ok: false, error: 'The short code must be text' }
    else {
      const code = squash(input.code).toUpperCase()
      if (code.length > MAX_SUBJECT_CODE) return { ok: false, error: `Keep the short code to ${MAX_SUBJECT_CODE} characters` }
      value.code = code || null
    }
  }
  if (input.color !== undefined) {
    if (input.color === null || input.color === '') value.color = null
    else if (typeof input.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(input.color)) return { ok: false, error: 'Pick a colour' }
    else value.color = input.color.toLowerCase()
  }
  if (input.grades !== undefined) {
    if (!Array.isArray(input.grades) || input.grades.some((g) => typeof g !== 'string')) return { ok: false, error: 'Pick the grades from the list' }
    const grades = [...new Set(input.grades as string[])]
    if (schoolGrades.length > 0 && grades.some((g) => !schoolGrades.includes(g))) return { ok: false, error: 'Pick grades your school teaches' }
    value.grades = grades
  }
  return { ok: true, value }
}

/** Whether a subject is taught in this grade. */
export const subjectInGrade = (subject: Pick<SchoolSubject, 'grades'>, grade: string | null | undefined) =>
  subject.grades.length === 0 || (!!grade && subject.grades.some((g) => g.toLowerCase() === grade.trim().toLowerCase()))

// Common other spellings of the standard subjects.
const ALIASES: Record<string, string[]> = {
  mathematics: ['math', 'maths', 'mathematic', 'core mathematics', 'core maths', 'numeracy'],
  'english language': ['english', 'eng', 'english lang', 'literacy'],
  'integrated science': ['science', 'general science', 'basic science', 'sci'],
  'social studies': ['social', 'social science', 'socials'],
  'religious and moral education': ['rme', 'r.m.e', 'r.m.e.', 'religious education', 'religious & moral education', 'moral education'],
  computing: ['ict', 'computer', 'computers', 'computer science', 'information technology', 'information and communication technology'],
  french: ['fre', 'french language'],
  'ghanaian language': ['twi', 'ga', 'ewe', 'fante', 'dagbani', 'local language', 'ghanaian languages'],
  'career technology': ['career tech', 'ct', 'cte', 'pre-technical skills', 'basic design and technology', 'bdt'],
  'creative arts and design': ['creative arts', 'cad', 'art', 'arts', 'visual arts', 'music', 'creative art'],
  'physical education': ['pe', 'p.e', 'p.e.', 'physical education and health', 'phe'],
}

const key = (value: string) => squash(value).toLowerCase()

/**
 * The listed subject a typed subject most likely means: same name or code
 * (any case), else a common other spelling of it. Null when nothing fits.
 */
export function matchSubject<T extends Pick<SchoolSubject, 'name' | 'code'>>(text: string | null | undefined, subjects: readonly T[]): T | null {
  if (!text || !key(text)) return null
  const k = key(text)
  const exact = subjects.find((s) => key(s.name) === k || (s.code && key(s.code) === k))
  if (exact) return exact
  for (const s of subjects) {
    const aliases = ALIASES[key(s.name)]
    if (aliases?.includes(k)) return s
  }
  return null
}

/** The teacher for a subject in a class: the class's own assignment, else the grade's. */
export function teacherFor(assignments: readonly SubjectTeacherAssignment[], subjectId: string, grade: string, classId: string | null): string | null {
  const forSubject = assignments.filter((a) => a.subjectId === subjectId && a.grade === grade)
  if (classId) {
    const own = forSubject.find((a) => a.classId === classId)
    if (own) return own.teacherId
  }
  return forSubject.find((a) => a.classId === null)?.teacherId ?? null
}
