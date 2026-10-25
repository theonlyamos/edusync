import type { SchoolRecord, ServiceSupabase } from '@/lib/school-access.server'
import { GRADE_LEVELS } from '@/lib/constants'
import { compareClasses, type ClassPerson, type SchoolClassDetail, type SchoolClassSummary } from '@/lib/school-classes'
import { PeopleError } from '@/lib/school-people.server'

const CHUNK = 200
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value)

function chunks<T>(items: readonly T[], size = CHUNK): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

const gradeOrder = (grade: string) => {
  const i = (GRADE_LEVELS as readonly string[]).indexOf(grade)
  return i === -1 ? 999 : i
}

type ClassRow = { id: string; grade: string; name: string; room: string | null; class_teacher_id: string | null }

async function names(supabase: ServiceSupabase, userIds: string[]): Promise<Map<string, { name: string; email: string }>> {
  const out = new Map<string, { name: string; email: string }>()
  for (const ids of chunks([...new Set(userIds)])) {
    const { data, error } = await supabase.from('users').select('id, name, email').in('id', ids)
    if (error) throw error
    for (const u of data ?? []) {
      const email = String(u.email ?? '')
      out.set(u.id as string, { name: (u.name as string | null)?.trim() || email || 'Unknown', email })
    }
  }
  return out
}

/** Active members of the school with this role, by user id. */
async function activeMembers(supabase: ServiceSupabase, schoolId: string, role: string, userIds?: string[]): Promise<Set<string>> {
  const out = new Set<string>()
  const run = async (ids?: string[]) => {
    let query = supabase.from('organization_members').select('user_id').eq('organization_id', schoolId).eq('role', role).eq('is_active', true)
    if (ids) query = query.in('user_id', ids)
    const { data, error } = await query.limit(20000)
    if (error) throw error
    for (const m of data ?? []) out.add(m.user_id as string)
  }
  if (userIds) for (const ids of chunks([...new Set(userIds)])) await run(ids)
  else await run()
  return out
}

/** Every class in the school, in grade order. Callers must check the viewer belongs to this school. */
export async function listSchoolClasses(supabase: ServiceSupabase, schoolId: string, options: { grade?: string } = {}): Promise<SchoolClassSummary[]> {
  let query = supabase.from('school_classes').select('id, grade, name, room, class_teacher_id').eq('organization_id', schoolId)
  if (options.grade) query = query.eq('grade', options.grade)
  const { data, error } = await query.limit(2000)
  if (error) throw error
  const classes = (data ?? []) as ClassRow[]
  if (classes.length === 0) return []
  const classIds = classes.map((c) => c.id)

  const [students, teachers, timetables, activeStudents] = await Promise.all([
    supabase.from('school_class_students').select('class_id, student_id').eq('organization_id', schoolId).limit(50000),
    supabase.from('school_class_teachers').select('class_id, teacher_id').eq('organization_id', schoolId).limit(20000),
    supabase.from('timetables').select('class_id').eq('organization_id', schoolId).in('class_id', classIds),
    activeMembers(supabase, schoolId, 'student'),
  ])
  for (const r of [students, teachers, timetables]) if (r.error) throw r.error

  const teacherIds = [...(teachers.data ?? []).map((t) => t.teacher_id as string), ...classes.map((c) => c.class_teacher_id).filter((id): id is string => Boolean(id))]
  const people = await names(supabase, teacherIds)
  const withTimetable = new Set((timetables.data ?? []).map((t) => t.class_id as string))

  return classes
    .map((c) => ({
      id: c.id,
      grade: c.grade,
      name: c.name,
      room: c.room,
      classTeacher: c.class_teacher_id ? { userId: c.class_teacher_id, name: people.get(c.class_teacher_id)?.name ?? 'Teacher' } : null,
      studentCount: (students.data ?? []).filter((s) => s.class_id === c.id && activeStudents.has(s.student_id as string)).length,
      teachers: (teachers.data ?? [])
        .filter((t) => t.class_id === c.id)
        .map((t) => ({ userId: t.teacher_id as string, name: people.get(t.teacher_id as string)?.name ?? 'Teacher' }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      hasTimetable: withTimetable.has(c.id),
    }))
    .sort(compareClasses(gradeOrder))
}

async function findClass(supabase: ServiceSupabase, schoolId: string, classId: string): Promise<ClassRow> {
  if (!isUuid(classId)) throw new PeopleError('Class not found', 404)
  const { data, error } = await supabase
    .from('school_classes')
    .select('id, grade, name, room, class_teacher_id')
    .eq('organization_id', schoolId)
    .eq('id', classId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new PeopleError('Class not found', 404)
  return data as ClassRow
}

/** One class with its students and teachers. */
export async function getSchoolClass(supabase: ServiceSupabase, schoolId: string, classId: string): Promise<SchoolClassDetail> {
  const row = await findClass(supabase, schoolId, classId)
  const [summary] = await listSchoolClasses(supabase, schoolId, { grade: row.grade }).then((list) => list.filter((c) => c.id === row.id))
  const [students, teachers] = await Promise.all([
    supabase.from('school_class_students').select('student_id').eq('class_id', row.id).limit(5000),
    supabase.from('school_class_teachers').select('teacher_id').eq('class_id', row.id).limit(500),
  ])
  if (students.error) throw students.error
  if (teachers.error) throw teachers.error
  const studentIds = (students.data ?? []).map((s) => s.student_id as string)
  const teacherIds = (teachers.data ?? []).map((t) => t.teacher_id as string)
  const [people, activeStudents, activeTeachers] = await Promise.all([
    names(supabase, [...studentIds, ...teacherIds]),
    activeMembers(supabase, schoolId, 'student', studentIds),
    activeMembers(supabase, schoolId, 'teacher', teacherIds),
  ])
  const grades = new Map<string, string | null>()
  for (const ids of chunks(studentIds)) {
    const { data, error } = await supabase.from('students').select('user_id, grade').in('user_id', ids)
    if (error) throw error
    for (const s of data ?? []) grades.set(s.user_id as string, (s.grade as string | null) ?? null)
  }
  const person = (userId: string, active: Set<string>): ClassPerson => ({
    userId,
    name: people.get(userId)?.name ?? 'Unknown',
    email: people.get(userId)?.email ?? '',
    isActive: active.has(userId),
  })
  return {
    ...summary,
    students: studentIds.map((id) => ({ ...person(id, activeStudents), grade: grades.get(id) ?? null })).sort((a, b) => a.name.localeCompare(b.name)),
    teacherPeople: teacherIds.map((id) => person(id, activeTeachers)).sort((a, b) => a.name.localeCompare(b.name)),
  }
}

async function checkClassTeacher(supabase: ServiceSupabase, schoolId: string, teacherId: unknown): Promise<string | null> {
  if (teacherId === null || teacherId === undefined || teacherId === '') return null
  if (!isUuid(teacherId)) throw new PeopleError('Pick one of your school’s teachers', 400)
  const active = await activeMembers(supabase, schoolId, 'teacher', [teacherId])
  if (!active.has(teacherId)) throw new PeopleError('Pick one of your school’s teachers', 400)
  return teacherId
}

function duplicateName(error: { code?: string } | null): boolean {
  return error?.code === '23505'
}

/** Adds classes to a grade, e.g. ["A", "B"]. */
export async function createSchoolClasses(
  supabase: ServiceSupabase,
  school: Pick<SchoolRecord, 'id' | 'grade_levels'>,
  input: { grade: string; names: string[]; room: string | null; classTeacherId?: unknown },
): Promise<string[]> {
  const grades = school.grade_levels ?? []
  if (grades.length > 0 && !grades.includes(input.grade)) throw new PeopleError('Pick one of your school’s grades', 400)
  const classTeacherId = await checkClassTeacher(supabase, school.id, input.classTeacherId)
  const rows = input.names.map((name) => ({
    organization_id: school.id,
    grade: input.grade,
    name,
    room: input.names.length === 1 ? input.room : null,
    class_teacher_id: input.names.length === 1 ? classTeacherId : null,
  }))
  const { data, error } = await supabase.from('school_classes').insert(rows).select('id')
  if (duplicateName(error)) throw new PeopleError('A class with that name already exists in this grade', 409)
  if (error) throw error
  const ids = (data ?? []).map((r) => r.id as string)
  if (classTeacherId && ids[0]) await addClassTeachers(supabase, school.id, ids[0], [classTeacherId])
  return ids
}

export async function updateSchoolClass(
  supabase: ServiceSupabase,
  schoolId: string,
  classId: string,
  update: { name?: string; room?: string | null; classTeacherId?: unknown },
) {
  await findClass(supabase, schoolId, classId)
  const values: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (update.name !== undefined) values.name = update.name
  if (update.room !== undefined) values.room = update.room
  if (update.classTeacherId !== undefined) values.class_teacher_id = await checkClassTeacher(supabase, schoolId, update.classTeacherId)
  const { error } = await supabase.from('school_classes').update(values).eq('id', classId).eq('organization_id', schoolId)
  if (duplicateName(error)) throw new PeopleError('A class with that name already exists in this grade', 409)
  if (error) throw error
  if (typeof values.class_teacher_id === 'string') await addClassTeachers(supabase, schoolId, classId, [values.class_teacher_id])
}

/** Deletes a class. Its students stay in the grade without a class; its timetable goes with it. */
export async function deleteSchoolClass(supabase: ServiceSupabase, schoolId: string, classId: string) {
  await findClass(supabase, schoolId, classId)
  const { error } = await supabase.from('school_classes').delete().eq('id', classId).eq('organization_id', schoolId)
  if (error) throw error
}

/**
 * Puts students in a class. A student in another class leaves it, and a
 * student in another grade moves to the class's grade.
 */
export async function addClassStudents(supabase: ServiceSupabase, schoolId: string, classId: string, studentIds: string[]): Promise<{ added: number; movedGrade: number }> {
  const row = await findClass(supabase, schoolId, classId)
  const ids = [...new Set(studentIds.filter(isUuid))]
  if (ids.length === 0) return { added: 0, movedGrade: 0 }
  const active = await activeMembers(supabase, schoolId, 'student', ids)
  if (active.size !== ids.length) throw new PeopleError('Some of these people are not active students at your school', 400)

  let movedGrade = 0
  for (const part of chunks(ids)) {
    const { data, error } = await supabase.from('students').select('user_id, grade').in('user_id', part)
    if (error) throw error
    const moving = (data ?? []).filter((s) => s.grade !== row.grade).map((s) => s.user_id as string)
    if (moving.length > 0) {
      const { error: gradeError } = await supabase.from('students').update({ grade: row.grade }).eq('organization_id', schoolId).in('user_id', moving)
      if (gradeError) throw gradeError
      movedGrade += moving.length
    }
    // One class each: leave any other class first.
    const { error: leaveError } = await supabase.from('school_class_students').delete().eq('organization_id', schoolId).in('student_id', part)
    if (leaveError) throw leaveError
    const { error: joinError } = await supabase
      .from('school_class_students')
      .insert(part.map((studentId) => ({ class_id: classId, student_id: studentId, organization_id: schoolId })))
    if (joinError) throw joinError
  }
  return { added: ids.length, movedGrade }
}

export async function removeClassStudents(supabase: ServiceSupabase, schoolId: string, classId: string, studentIds: string[]) {
  await findClass(supabase, schoolId, classId)
  const ids = [...new Set(studentIds.filter(isUuid))]
  for (const part of chunks(ids)) {
    const { error } = await supabase.from('school_class_students').delete().eq('class_id', classId).in('student_id', part)
    if (error) throw error
  }
}

export async function addClassTeachers(supabase: ServiceSupabase, schoolId: string, classId: string, teacherIds: string[]) {
  await findClass(supabase, schoolId, classId)
  const ids = [...new Set(teacherIds.filter(isUuid))]
  if (ids.length === 0) return
  const active = await activeMembers(supabase, schoolId, 'teacher', ids)
  if (active.size !== ids.length) throw new PeopleError('Some of these people are not active teachers at your school', 400)
  const { data: existing, error } = await supabase.from('school_class_teachers').select('teacher_id').eq('class_id', classId).in('teacher_id', ids)
  if (error) throw error
  const have = new Set((existing ?? []).map((t) => t.teacher_id as string))
  const rows = ids.filter((id) => !have.has(id)).map((teacherId) => ({ class_id: classId, teacher_id: teacherId, organization_id: schoolId }))
  if (rows.length === 0) return
  const { error: insertError } = await supabase.from('school_class_teachers').insert(rows)
  if (insertError) throw insertError
}

export async function removeClassTeachers(supabase: ServiceSupabase, schoolId: string, classId: string, teacherIds: string[]) {
  await findClass(supabase, schoolId, classId)
  const ids = [...new Set(teacherIds.filter(isUuid))]
  if (ids.length === 0) return
  const { error } = await supabase.from('school_class_teachers').delete().eq('class_id', classId).in('teacher_id', ids)
  if (error) throw error
}

/** The class a student is in at their school, if any. */
export async function studentClass(supabase: ServiceSupabase, studentId: string): Promise<{ id: string; grade: string; name: string; organizationId: string } | null> {
  const { data, error } = await supabase
    .from('school_class_students')
    .select('class_id, school_classes!inner(id, grade, name, organization_id)')
    .eq('student_id', studentId)
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const c = (Array.isArray(data.school_classes) ? data.school_classes[0] : data.school_classes) as { id: string; grade: string; name: string; organization_id: string } | undefined
  return c ? { id: c.id, grade: c.grade, name: c.name, organizationId: c.organization_id } : null
}

/** Class id for each student, for lists. */
export async function classesByStudent(supabase: ServiceSupabase, schoolId: string): Promise<Map<string, { id: string; name: string; grade: string }>> {
  const [links, classes] = await Promise.all([
    supabase.from('school_class_students').select('class_id, student_id').eq('organization_id', schoolId).limit(50000),
    supabase.from('school_classes').select('id, name, grade').eq('organization_id', schoolId).limit(2000),
  ])
  if (links.error) throw links.error
  if (classes.error) throw classes.error
  const byId = new Map((classes.data ?? []).map((c) => [c.id as string, { id: c.id as string, name: c.name as string, grade: c.grade as string }]))
  const out = new Map<string, { id: string; name: string; grade: string }>()
  for (const l of links.data ?? []) {
    const c = byId.get(l.class_id as string)
    if (c) out.set(l.student_id as string, c)
  }
  return out
}

/** The id of the class a student is in, or null. */
export async function studentClassId(supabase: ServiceSupabase, studentId: string): Promise<string | null> {
  const { data, error } = await supabase.from('school_class_students').select('class_id').eq('student_id', studentId).limit(1).maybeSingle()
  if (error) throw error
  return (data?.class_id as string | undefined) ?? null
}
