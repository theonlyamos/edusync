import type { SchoolRecord, ServiceSupabase } from '@/lib/school-access.server'
import { PeopleError } from '@/lib/school-people.server'
import {
  MAX_SUBJECTS_PER_SCHOOL,
  STANDARD_SUBJECTS,
  matchSubject,
  type CleanSubject,
  type SchoolSubject,
  type SubjectTeacherAssignment,
} from '@/lib/school-subjects'
import type { Timetable } from '@/lib/timetable'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value)
const key = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase()

type SubjectRow = { id: string; name: string; code: string | null; color: string | null; grades: string[] | null; archived_at: string | null }

const toSubject = (row: SubjectRow): SchoolSubject => ({
  id: row.id,
  name: row.name,
  code: row.code,
  color: row.color,
  grades: row.grades ?? [],
  archived: Boolean(row.archived_at),
})

export async function listSubjects(supabase: ServiceSupabase, schoolId: string, options: { includeArchived?: boolean } = {}): Promise<SchoolSubject[]> {
  let query = supabase.from('school_subjects').select('id, name, code, color, grades, archived_at').eq('organization_id', schoolId)
  if (!options.includeArchived) query = query.is('archived_at', null)
  const { data, error } = await query.limit(500)
  if (error) throw error
  return ((data ?? []) as SubjectRow[]).map(toSubject).sort((a, b) => a.name.localeCompare(b.name))
}

async function findSubject(supabase: ServiceSupabase, schoolId: string, subjectId: string): Promise<SubjectRow> {
  if (!isUuid(subjectId)) throw new PeopleError('Subject not found', 404)
  const { data, error } = await supabase
    .from('school_subjects')
    .select('id, name, code, color, grades, archived_at')
    .eq('organization_id', schoolId)
    .eq('id', subjectId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new PeopleError('Subject not found', 404)
  return data as SubjectRow
}

/** Adds subjects; names the school already has are skipped. Returns how many were added. */
export async function createSubjects(supabase: ServiceSupabase, school: Pick<SchoolRecord, 'id'>, subjects: CleanSubject[]): Promise<number> {
  const existing = await listSubjects(supabase, school.id, { includeArchived: true })
  const have = new Set(existing.map((s) => key(s.name)))
  const rows = []
  for (const s of subjects) {
    if (!s.name || have.has(key(s.name))) continue
    have.add(key(s.name))
    rows.push({ organization_id: school.id, name: s.name, code: s.code ?? null, color: s.color ?? null, grades: s.grades ?? [] })
  }
  if (existing.length + rows.length > MAX_SUBJECTS_PER_SCHOOL) throw new PeopleError(`A school can have up to ${MAX_SUBJECTS_PER_SCHOOL} subjects`, 400)
  if (rows.length === 0) {
    if (subjects.length === 1) throw new PeopleError('Your school already has a subject with this name', 409)
    return 0
  }
  const { data, error } = await supabase.from('school_subjects').insert(rows).select('id, name')
  if (error) {
    if (error.code === '23505') throw new PeopleError('Your school already has a subject with this name', 409)
    throw error
  }
  // Link lessons (and tidy homework, timetables and teachers) typed with the same name.
  const added = (data ?? []) as Array<{ id: string; name: string }>
  if (added.length) await renameEverywhere(supabase, school.id, added.map((s) => ({ from: s.name, to: s.name, subjectId: s.id })))
  return rows.length
}

export const standardSubjects = (): CleanSubject[] => STANDARD_SUBJECTS.map((s) => ({ ...s, grades: [] }))

/** Edits a subject. A rename also renames it on lessons, homework, timetables and teachers. */
export async function updateSubject(supabase: ServiceSupabase, schoolId: string, subjectId: string, update: CleanSubject & { archived?: boolean }) {
  const row = await findSubject(supabase, schoolId, subjectId)
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (update.name !== undefined) patch.name = update.name
  if (update.code !== undefined) patch.code = update.code
  if (update.color !== undefined) patch.color = update.color
  if (update.grades !== undefined) patch.grades = update.grades
  if (update.archived !== undefined) patch.archived_at = update.archived ? new Date().toISOString() : null
  const { error } = await supabase.from('school_subjects').update(patch).eq('id', row.id).eq('organization_id', schoolId)
  if (error) {
    if (error.code === '23505') throw new PeopleError('Your school already has a subject with this name', 409)
    throw error
  }
  if (update.name !== undefined && update.name !== row.name) await renameEverywhere(supabase, schoolId, [{ from: row.name, to: update.name, subjectId: row.id }])
  if (update.grades !== undefined && update.grades.length > 0) await dropAssignmentsOutside(supabase, schoolId, row.id, update.grades)
}

/** Removes who-teaches-what entries in grades a subject is no longer taught in. */
async function dropAssignmentsOutside(supabase: ServiceSupabase, schoolId: string, subjectId: string, grades: string[]) {
  const stale = (await listAssignments(supabase, schoolId)).filter((a) => a.subjectId === subjectId && !grades.includes(a.grade))
  if (stale.length === 0) return
  const { error } = await supabase.from('school_subject_teachers').delete().in('id', stale.map((a) => a.id))
  if (error) throw error
  await syncTeacherProfiles(supabase, schoolId, stale.map((a) => a.teacherId))
}

/** Deletes a subject nobody uses yet; otherwise it should be archived. */
export async function deleteSubject(supabase: ServiceSupabase, schoolId: string, subjectId: string) {
  const row = await findSubject(supabase, schoolId, subjectId)
  const { count, error } = await supabase.from('lessons').select('id', { count: 'exact', head: true }).eq('subject_id', row.id)
  if (error) throw error
  if ((count ?? 0) > 0) throw new PeopleError('Lessons use this subject. Archive it instead, so they keep it.', 409)
  const { error: deleteError } = await supabase.from('school_subjects').delete().eq('id', row.id).eq('organization_id', schoolId)
  if (deleteError) throw deleteError
}

export async function listAssignments(supabase: ServiceSupabase, schoolId: string): Promise<SubjectTeacherAssignment[]> {
  const { data, error } = await supabase
    .from('school_subject_teachers')
    .select('id, subject_id, grade, class_id, teacher_id')
    .eq('organization_id', schoolId)
    .limit(5000)
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: r.id as string,
    subjectId: r.subject_id as string,
    grade: r.grade as string,
    classId: (r.class_id as string | null) ?? null,
    teacherId: r.teacher_id as string,
  }))
}

/**
 * Sets (or clears, with teacherId null) who teaches a subject in a grade or
 * one class of it. The teacher's "subjects" and "grades" follow.
 */
export async function setAssignment(
  supabase: ServiceSupabase,
  school: Pick<SchoolRecord, 'id' | 'grade_levels'>,
  input: { subjectId: unknown; grade: unknown; classId: unknown; teacherId: unknown },
) {
  if (typeof input.grade !== 'string' || !input.grade) throw new PeopleError('Pick a grade', 400)
  const grade = input.grade
  const grades = school.grade_levels ?? []
  if (grades.length > 0 && !grades.includes(grade)) throw new PeopleError('Pick one of your school’s grades', 400)
  const subject = await findSubject(supabase, school.id, String(input.subjectId))
  let classId: string | null = null
  if (input.classId !== null && input.classId !== undefined && input.classId !== '') {
    if (!isUuid(input.classId)) throw new PeopleError('Class not found', 404)
    const { data, error } = await supabase.from('school_classes').select('id, grade').eq('organization_id', school.id).eq('id', input.classId).maybeSingle()
    if (error) throw error
    if (!data || data.grade !== grade) throw new PeopleError('Class not found in this grade', 404)
    classId = data.id as string
  }
  let teacherId: string | null = null
  if (input.teacherId !== null && input.teacherId !== undefined && input.teacherId !== '') {
    if (!isUuid(input.teacherId)) throw new PeopleError('Pick one of your school’s teachers', 400)
    const { data, error } = await supabase
      .from('organization_members')
      .select('user_id')
      .eq('organization_id', school.id)
      .eq('role', 'teacher')
      .eq('is_active', true)
      .eq('user_id', input.teacherId)
      .maybeSingle()
    if (error) throw error
    if (!data) throw new PeopleError('Pick one of your school’s teachers', 400)
    teacherId = input.teacherId
  }

  let existingQuery = supabase.from('school_subject_teachers').select('id, teacher_id').eq('subject_id', subject.id).eq('grade', grade)
  existingQuery = classId ? existingQuery.eq('class_id', classId) : existingQuery.is('class_id', null)
  const { data: existing, error: existingError } = await existingQuery.maybeSingle()
  if (existingError) throw existingError
  const previousTeacher = (existing?.teacher_id as string | undefined) ?? null

  if (existing && !teacherId) {
    const { error } = await supabase.from('school_subject_teachers').delete().eq('id', existing.id)
    if (error) throw error
  } else if (existing && teacherId) {
    const { error } = await supabase.from('school_subject_teachers').update({ teacher_id: teacherId }).eq('id', existing.id)
    if (error) throw error
  } else if (teacherId) {
    const { error } = await supabase
      .from('school_subject_teachers')
      .insert({ organization_id: school.id, subject_id: subject.id, grade, class_id: classId, teacher_id: teacherId })
    if (error) {
      if (error.code === '23505') throw new PeopleError('Someone just changed this. Refresh and try again.', 409)
      throw error
    }
  }
  await syncTeacherProfiles(supabase, school.id, [previousTeacher, teacherId].filter((id): id is string => Boolean(id)))
}

/**
 * Keeps teachers.subjects and teachers.grades in step with what they are
 * assigned, so the teacher pages and filters that read them stay right.
 * Grades the admin set by hand are kept.
 */
export async function syncTeacherProfiles(supabase: ServiceSupabase, schoolId: string, teacherIds: string[]) {
  const ids = [...new Set(teacherIds)]
  if (ids.length === 0) return
  const [assignments, subjects] = await Promise.all([listAssignments(supabase, schoolId), listSubjects(supabase, schoolId, { includeArchived: true })])
  const nameById = new Map(subjects.map((s) => [s.id, s.name]))
  const listed = new Set(subjects.map((s) => key(s.name)))
  const { data: rows, error } = await supabase.from('teachers').select('user_id, subjects, grades').in('user_id', ids)
  if (error) throw error
  for (const teacherId of ids) {
    const row = (rows ?? []).find((r) => r.user_id === teacherId)
    const mine = assignments.filter((a) => a.teacherId === teacherId)
    // Listed subjects come from who teaches what; typed extras are kept.
    const extras = ((row?.subjects as string[] | null) ?? []).filter((s) => !listed.has(key(s)))
    const assigned = mine.map((a) => nameById.get(a.subjectId)).filter((n): n is string => Boolean(n))
    const names = [...new Set([...assigned.sort(), ...extras])]
    const current = (row?.grades as string[] | null) ?? []
    const grades = [...new Set([...current, ...mine.map((a) => a.grade)])]
    const { error: updateError } = await supabase.from('teachers').update({ subjects: names, grades }).eq('user_id', teacherId)
    if (updateError) throw updateError
  }
}

export type TypedSubject = {
  text: string
  lessons: number
  timetableSlots: number
  teachers: number
  /** The listed subject it most likely means. */
  suggestionId: string | null
}

type TimetableRow = { id: string; schedule: Timetable['schedule'] | null }

/** Subjects typed on lessons, timetables and teachers that aren't on the school's list. */
export async function typedSubjects(supabase: ServiceSupabase, schoolId: string): Promise<TypedSubject[]> {
  const [subjects, lessons, timetables, teachers] = await Promise.all([
    listSubjects(supabase, schoolId),
    supabase.from('lessons').select('subject').eq('organization_id', schoolId).is('subject_id', null).limit(5000),
    supabase.from('timetables').select('id, schedule').eq('organization_id', schoolId).limit(500),
    supabase.from('teachers').select('subjects').eq('organization_id', schoolId).limit(5000),
  ])
  if (lessons.error) throw lessons.error
  if (timetables.error) throw timetables.error
  if (teachers.error) throw teachers.error
  const listed = new Set(subjects.map((s) => key(s.name)))
  const out = new Map<string, TypedSubject>()
  const bump = (text: unknown, field: 'lessons' | 'timetableSlots' | 'teachers') => {
    if (typeof text !== 'string' || !key(text) || listed.has(key(text))) return
    const k = key(text)
    const row = out.get(k) ?? { text: text.trim(), lessons: 0, timetableSlots: 0, teachers: 0, suggestionId: matchSubject(text, subjects)?.id ?? null }
    row[field] += 1
    out.set(k, row)
  }
  for (const l of lessons.data ?? []) bump(l.subject, 'lessons')
  for (const t of (timetables.data ?? []) as TimetableRow[]) {
    for (const cells of Object.values(t.schedule ?? {})) for (const cell of Object.values(cells ?? {})) bump(cell?.subject, 'timetableSlots')
  }
  for (const t of teachers.data ?? []) for (const s of (t.subjects as string[] | null) ?? []) bump(s, 'teachers')
  return [...out.values()].sort((a, b) => b.lessons + b.timetableSlots + b.teachers - (a.lessons + a.timetableSlots + a.teachers))
}

/**
 * Replaces typed subjects with listed ones on lessons, homework, timetables
 * and teachers, in one pass however many there are.
 */
export async function mapTypedSubjects(supabase: ServiceSupabase, schoolId: string, matches: Array<{ text: unknown; subjectId: unknown }>) {
  const subjects = await listSubjects(supabase, schoolId, { includeArchived: true })
  const byId = new Map(subjects.map((s) => [s.id, s]))
  const renames: Rename[] = []
  for (const m of matches) {
    if (typeof m?.text !== 'string' || !key(m.text)) throw new PeopleError('Say which typed subject to replace', 400)
    const subject = isUuid(m.subjectId) ? byId.get(m.subjectId) : undefined
    if (!subject) throw new PeopleError('Subject not found', 404)
    renames.push({ from: m.text, to: subject.name, subjectId: subject.id })
  }
  await renameEverywhere(supabase, schoolId, renames)
}

type Rename = { from: string; to: string; subjectId: string }

/** Ids of rows grouped by the value they should be set to. */
function groupIds<T>(rows: T[], pick: (row: T) => string | null): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const row of rows) {
    const value = pick(row)
    if (value === null) continue
    const ids = out.get(value) ?? []
    ids.push((row as { id: string }).id)
    out.set(value, ids)
  }
  return out
}

async function updateInChunks(supabase: ServiceSupabase, table: 'lessons' | 'homeworks', ids: string[], patch: Record<string, unknown>) {
  for (let i = 0; i < ids.length; i += 200) {
    const { error } = await supabase.from(table).update(patch).in('id', ids.slice(i, i + 200))
    if (error) throw error
  }
}

async function renameEverywhere(supabase: ServiceSupabase, schoolId: string, renames: Rename[]) {
  // Matched by name, any case and spacing.
  const target = new Map(renames.map((r) => [key(r.from), r]))
  const find = (text: unknown) => (typeof text === 'string' ? target.get(key(text)) : undefined)

  const [lessons, homeworks, timetables, teachers] = await Promise.all([
    supabase.from('lessons').select('id, subject, subject_id').eq('organization_id', schoolId).limit(20000),
    supabase.from('homeworks').select('id, subject').eq('organization_id', schoolId).limit(20000),
    supabase.from('timetables').select('id, schedule').eq('organization_id', schoolId).limit(500),
    supabase.from('teachers').select('id, subjects').eq('organization_id', schoolId).limit(5000),
  ])
  if (lessons.error) throw lessons.error
  if (homeworks.error) throw homeworks.error
  if (timetables.error) throw timetables.error
  if (teachers.error) throw teachers.error

  // Lessons keep the text their teacher typed (changing it would send their
  // approved materials back for review); they are linked to the subject instead.
  const lessonGroups = groupIds(lessons.data ?? [], (l) => {
    const r = find(l.subject)
    return r && l.subject_id !== r.subjectId ? r.subjectId : null
  })
  for (const [subjectId, ids] of lessonGroups) await updateInChunks(supabase, 'lessons', ids, { subject_id: subjectId })

  const homeworkGroups = groupIds(homeworks.data ?? [], (h) => {
    const r = find(h.subject)
    return r && h.subject !== r.to ? r.to : null
  })
  for (const [name, ids] of homeworkGroups) await updateInChunks(supabase, 'homeworks', ids, { subject: name })

  for (const t of (timetables.data ?? []) as TimetableRow[]) {
    let changed = false
    const schedule = structuredClone(t.schedule ?? {})
    for (const cells of Object.values(schedule)) {
      for (const cell of Object.values(cells ?? {})) {
        const r = cell ? find(cell.subject) : undefined
        if (cell && r && cell.subject !== r.to) {
          cell.subject = r.to
          changed = true
        }
      }
    }
    if (changed) {
      const { error } = await supabase.from('timetables').update({ schedule }).eq('id', t.id)
      if (error) throw error
    }
  }

  for (const t of teachers.data ?? []) {
    const list = (t.subjects as string[] | null) ?? []
    if (!list.some((s) => find(s))) continue
    const next = [...new Set(list.map((s) => find(s)?.to ?? s))]
    const { error } = await supabase.from('teachers').update({ subjects: next }).eq('id', t.id)
    if (error) throw error
  }
}
