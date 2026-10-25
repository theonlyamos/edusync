/** Classes (sections) within a grade, e.g. "JHS 1 A". Shared by the server and the school pages. */

export const MAX_CLASS_NAME = 60
export const MAX_ROOM = 60
export const MAX_CLASSES_AT_ONCE = 26

export type SchoolClassSummary = {
  id: string
  grade: string
  name: string
  room: string | null
  classTeacher: { userId: string; name: string } | null
  studentCount: number
  teachers: Array<{ userId: string; name: string }>
  hasTimetable: boolean
}

export type ClassPerson = { userId: string; name: string; email: string; isActive: boolean }

export type SchoolClassDetail = SchoolClassSummary & {
  students: Array<ClassPerson & { grade: string | null }>
  teacherPeople: ClassPerson[]
}

/**
 * Names typed into "Add classes": "A, B, C" makes three classes. Blank and
 * repeated names are dropped; an error names the first bad one.
 */
export function parseClassNames(input: unknown): { ok: true; names: string[] } | { ok: false; error: string } {
  if (typeof input !== 'string') return { ok: false, error: 'Give the class a name' }
  const seen = new Set<string>()
  const names: string[] = []
  for (const raw of input.split(',')) {
    const name = raw.replace(/\s+/g, ' ').trim()
    if (!name) continue
    if (name.length > MAX_CLASS_NAME) return { ok: false, error: `Keep class names under ${MAX_CLASS_NAME} characters` }
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    names.push(name)
  }
  if (names.length === 0) return { ok: false, error: 'Give the class a name' }
  if (names.length > MAX_CLASSES_AT_ONCE) return { ok: false, error: `Add at most ${MAX_CLASSES_AT_ONCE} classes at once` }
  return { ok: true, names }
}

export function normalizeRoom(input: unknown): string | null | 'invalid' {
  if (input === undefined || input === null) return null
  if (typeof input !== 'string') return 'invalid'
  const room = input.replace(/\s+/g, ' ').trim()
  if (!room) return null
  return room.length > MAX_ROOM ? 'invalid' : room
}

/** "JHS 1 A" style label: the grade label plus the class name, unless the name already says the grade. */
export function classLabel(gradeLabel: string, name: string): string {
  return name.toLowerCase().startsWith(gradeLabel.toLowerCase()) ? name : `${gradeLabel} ${name}`
}

/** Sort classes by grade order, then name with numbers in order ("2" before "10"). */
export function compareClasses(gradeOrder: (grade: string) => number) {
  return (a: { grade: string; name: string }, b: { grade: string; name: string }) =>
    gradeOrder(a.grade) - gradeOrder(b.grade) || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
}

/** Whether a student in this class (or in none) is in a lesson's, homework's or live class's audience. Empty means the whole grade. */
export function inClassAudience(audience: readonly string[] | null | undefined, studentClassId: string | null | undefined): boolean {
  if (!audience || audience.length === 0) return true
  return Boolean(studentClassId && audience.includes(studentClassId))
}
