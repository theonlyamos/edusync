import type { SchoolRecord, ServiceSupabase } from '@/lib/school-access.server'
import {
  USAGE_KINDS,
  dayKey,
  emptyCredits,
  netUsage,
  periodDays,
  type DailyActivity,
  type PersonUsage,
  type ReportPersonRole,
  type SchoolReport,
  type TeacherActivity,
  type SubjectActivity,
  type UsageKind,
} from '@/lib/school-reports'
import { matchSubject } from '@/lib/school-subjects'
import { listSubjects } from '@/lib/school-subjects.server'

const DAY = 24 * 60 * 60 * 1000
const CHUNK = 200

function chunks<T>(items: readonly T[], size = CHUNK): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

type Row = Record<string, any>

async function all(query: PromiseLike<{ data: Row[] | null; error: unknown }>): Promise<Row[]> {
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

/** Runs one query per chunk of ids and joins the rows. */
async function byChunks(ids: readonly string[], run: (ids: string[]) => PromiseLike<{ data: Row[] | null; error: unknown }>): Promise<Row[]> {
  const out: Row[] = []
  for (const part of chunks(ids)) out.push(...(await all(run(part))))
  return out
}

const later = (a: string | null, b: string | null) => (!a ? b : !b ? a : a > b ? a : b)

/**
 * Who used what in the school between `from` and `to`: credits, AI tools,
 * studying and teaching. Callers must check the viewer manages this school.
 */
export async function getSchoolReport(
  supabase: ServiceSupabase,
  school: Pick<SchoolRecord, 'id' | 'timezone'>,
  options: { days: number; now?: Date },
): Promise<SchoolReport> {
  const now = options.now ?? new Date()
  const days = Math.max(1, Math.min(366, Math.floor(options.days)))
  const to = now
  const from = new Date(now.getTime() - days * DAY)
  const fromIso = from.toISOString()
  const toIso = to.toISOString()
  const timezone = school.timezone || 'UTC'
  const schoolId = school.id

  const [subjectList, members, students, credits, aiUsage, homeworks, lessons, liveClasses] = await Promise.all([
    listSubjects(supabase, schoolId, { includeArchived: true }),
    all(supabase.from('organization_members').select('user_id, role, is_active').eq('organization_id', schoolId).limit(20000)),
    all(supabase.from('students').select('user_id, grade').eq('organization_id', schoolId).limit(20000)),
    all(
      supabase
        .from('organization_credit_transactions')
        .select('user_id, transaction_type, usage_kind, credits, refunded_credits, created_at')
        .eq('organization_id', schoolId)
        .gte('created_at', fromIso)
        .lt('created_at', toIso)
        .limit(100000),
    ),
    all(
      supabase
        .from('organization_ai_usage')
        .select('user_id, category, quantity, refunded_at, reference_id, created_at')
        .eq('organization_id', schoolId)
        .gte('created_at', fromIso)
        .lt('created_at', toIso)
        .limit(100000),
    ),
    all(supabase.from('homeworks').select('id, owner_id, status, published_at, subject').eq('organization_id', schoolId).limit(20000)),
    all(supabase.from('lessons').select('id, teacher_id, created_at, subject, subject_id').eq('organization_id', schoolId).limit(20000)),
    all(
      supabase
        .from('live_class_events')
        .select('organizer_id, status, scheduled_start_at')
        .eq('organization_id', schoolId)
        .gte('scheduled_start_at', fromIso)
        .lt('scheduled_start_at', toIso)
        .limit(20000),
    ),
  ])

  const memberByUser = new Map(members.map((m) => [m.user_id as string, m]))
  const studentIds = members.filter((m) => m.role === 'student').map((m) => m.user_id as string)
  const memberIds = members.map((m) => m.user_id as string)
  const gradeOf = new Map(students.map((s) => [s.user_id as string, (s.grade as string | null) ?? null]))

  const [attempts, runs, sessions, publications, teacherRows] = await Promise.all([
    byChunks(homeworks.map((h) => h.id as string), (ids) =>
      supabase.from('homework_attempts').select('homework_id, student_id, submitted_at').in('homework_id', ids).gte('submitted_at', fromIso).lt('submitted_at', toIso).limit(50000),
    ),
    byChunks(studentIds, (ids) =>
      supabase.from('learning_runs').select('student_id, lesson_id, created_at').in('student_id', ids).gte('created_at', fromIso).lt('created_at', toIso).limit(50000),
    ),
    byChunks(memberIds, (ids) =>
      supabase.from('learning_sessions').select('user_id, created_at, live_class_event_id').in('user_id', ids).gte('created_at', fromIso).lt('created_at', toIso).limit(50000),
    ),
    byChunks(lessons.map((l) => l.id as string), (ids) =>
      supabase.from('lesson_publications').select('lesson_id, published_by, published_at').in('lesson_id', ids).gte('published_at', fromIso).lt('published_at', toIso).limit(50000),
    ),
    all(supabase.from('teachers').select('id, user_id').eq('organization_id', schoolId).limit(5000)),
  ])

  // Everyone the report mentions, including people who have since left.
  const people = new Map<string, PersonUsage>()
  const person = (userId: string | null | undefined): PersonUsage | null => {
    if (!userId) return null
    let p = people.get(userId)
    if (!p) {
      const member = memberByUser.get(userId)
      p = {
        userId,
        name: '',
        email: '',
        role: (member?.role as ReportPersonRole | undefined) ?? 'former',
        grade: member?.role === 'student' ? gradeOf.get(userId) ?? null : null,
        isActive: Boolean(member?.is_active),
        credits: { ...emptyCredits(), total: 0 },
        visuals: 0,
        images: 0,
        tutorSessions: 0,
        lessonsStudied: 0,
        homeworkSubmitted: 0,
        lastActiveAt: null,
      }
      people.set(userId, p)
    }
    return p
  }
  for (const m of members) person(m.user_id as string)

  const daily = new Map<string, DailyActivity & { students: Set<string> }>(
    periodDays(to, days, timezone).map((date) => [date, { date, activeStudents: 0, creditsUsed: 0, submissions: 0, students: new Set<string>() }]),
  )
  const studentSet = new Set(studentIds)
  const markActive = (userId: string, at: string) => {
    const p = person(userId)
    if (p) p.lastActiveAt = later(p.lastActiveAt, at)
    if (studentSet.has(userId)) daily.get(dayKey(at, timezone))?.students.add(userId)
  }

  const creditsByKind = emptyCredits()
  let creditsUsed = 0
  let creditsPurchased = 0
  for (const tx of credits) {
    if (tx.transaction_type === 'purchase') {
      creditsPurchased += Number(tx.credits) || 0
      continue
    }
    if (tx.transaction_type !== 'usage') continue
    const used = netUsage(tx as { credits: number; refunded_credits: number })
    if (used === 0) continue
    creditsUsed += used
    const kind = (USAGE_KINDS as readonly string[]).includes(tx.usage_kind) ? (tx.usage_kind as UsageKind) : null
    if (kind) creditsByKind[kind] += used
    const day = daily.get(dayKey(tx.created_at as string, timezone))
    if (day) day.creditsUsed += used
    const p = person(tx.user_id as string | null)
    if (p) {
      if (kind) p.credits[kind] += used
      p.credits.total += used
    }
  }

  for (const row of aiUsage) {
    if (row.refunded_at || String(row.reference_id ?? '').startsWith('creative-concept:')) continue
    const p = person(row.user_id as string)
    if (!p) continue
    const quantity = Number(row.quantity) || 0
    if (row.category === 'interactive_generation') p.visuals += quantity
    else if (row.category === 'image_generation') p.images += quantity
  }

  for (const a of attempts) {
    const p = person(a.student_id as string)
    if (!p) continue
    p.homeworkSubmitted += 1
    const day = daily.get(dayKey(a.submitted_at as string, timezone))
    if (day) day.submissions += 1
    markActive(a.student_id as string, a.submitted_at as string)
  }

  const lessonsByStudent = new Map<string, Set<string>>()
  for (const r of runs) {
    const set = lessonsByStudent.get(r.student_id as string) ?? new Set<string>()
    set.add(r.lesson_id as string)
    lessonsByStudent.set(r.student_id as string, set)
    markActive(r.student_id as string, r.created_at as string)
  }
  for (const [userId, set] of lessonsByStudent) {
    const p = person(userId)
    if (p) p.lessonsStudied = set.size
  }

  let tutorSessions = 0
  for (const s of sessions) {
    if (s.live_class_event_id) continue
    const p = person(s.user_id as string)
    if (!p) continue
    p.tutorSessions += 1
    tutorSessions += 1
    markActive(s.user_id as string, s.created_at as string)
  }

  // Teaching.
  const userOfTeacher = new Map(teacherRows.map((t) => [t.id as string, t.user_id as string]))
  const teaching = new Map<string, TeacherActivity>()
  const teacher = (userId: string | null | undefined): TeacherActivity | null => {
    if (!userId) return null
    let t = teaching.get(userId)
    if (!t) {
      t = { userId, name: '', isActive: Boolean(memberByUser.get(userId)?.is_active), lessonsCreated: 0, lessonsPublished: 0, homeworkSet: 0, liveClassesHeld: 0, creditsUsed: 0 }
      teaching.set(userId, t)
    }
    return t
  }
  for (const m of members) if (m.role === 'teacher') teacher(m.user_id as string)

  for (const l of lessons) {
    if (String(l.created_at) < fromIso || String(l.created_at) >= toIso) continue
    const t = teacher(l.teacher_id ? userOfTeacher.get(l.teacher_id as string) : null)
    if (t) t.lessonsCreated += 1
  }
  const publishedByTeacher = new Map<string, Set<string>>()
  for (const p of publications) {
    const set = publishedByTeacher.get(p.published_by as string) ?? new Set<string>()
    set.add(p.lesson_id as string)
    publishedByTeacher.set(p.published_by as string, set)
  }
  for (const [userId, set] of publishedByTeacher) {
    const t = teacher(userId)
    if (t) t.lessonsPublished = set.size
  }
  let homeworkSet = 0
  for (const h of homeworks) {
    if (h.status !== 'published' || !h.published_at) continue
    if (String(h.published_at) < fromIso || String(h.published_at) >= toIso) continue
    homeworkSet += 1
    const t = teacher(h.owner_id as string)
    if (t) t.homeworkSet += 1
  }
  let liveClassesHeld = 0
  for (const e of liveClasses) {
    if (e.status === 'cancelled' || e.status === 'draft') continue
    if (new Date(e.scheduled_start_at as string).getTime() > now.getTime()) continue
    liveClassesHeld += 1
    const t = teacher(e.organizer_id as string)
    if (t) t.liveClassesHeld += 1
  }
  for (const t of teaching.values()) t.creditsUsed = people.get(t.userId)?.credits.total ?? 0

  const subjects = subjectActivity(subjectList, { lessons, homeworks, publications, runs, attempts, fromIso, toIso })

  // Names for everyone mentioned.
  const ids = [...new Set([...people.keys(), ...teaching.keys()])]
  const users = await byChunks(ids, (part) => supabase.from('users').select('id, name, email').in('id', part))
  const userById = new Map(users.map((u) => [u.id as string, u]))
  const nameOf = (userId: string) => {
    const u = userById.get(userId)
    return (u?.name as string | null)?.trim() || (u?.email as string | null) || 'Former member'
  }
  for (const p of people.values()) {
    p.name = nameOf(p.userId)
    p.email = (userById.get(p.userId)?.email as string | null) ?? ''
  }
  for (const t of teaching.values()) t.name = nameOf(t.userId)

  // Keep members and anyone else who did something in the period.
  const peopleList = [...people.values()]
    .filter((p) => memberByUser.has(p.userId) || p.credits.total > 0 || p.visuals > 0 || p.images > 0 || p.lastActiveAt)
    .sort((a, b) => b.credits.total - a.credits.total || (b.lastActiveAt ?? '').localeCompare(a.lastActiveAt ?? '') || a.name.localeCompare(b.name))
  const teacherList = [...teaching.values()]
    .filter((t) => memberByUser.get(t.userId)?.role === 'teacher' || t.lessonsCreated + t.lessonsPublished + t.homeworkSet + t.liveClassesHeld > 0)
    .sort((a, b) => (b.lessonsPublished + b.homeworkSet + b.liveClassesHeld) - (a.lessonsPublished + a.homeworkSet + a.liveClassesHeld) || a.name.localeCompare(b.name))

  const activeStudentIds = new Set<string>()
  for (const d of daily.values()) for (const id of d.students) activeStudentIds.add(id)
  const activeMembers = members.filter((m) => m.is_active)
  const activeTeacherIds = new Set(teacherList.filter((t) => t.lessonsCreated + t.lessonsPublished + t.homeworkSet + t.liveClassesHeld > 0).map((t) => t.userId))

  const dayList = [...daily.values()]
  const week = (part: typeof dayList) => {
    const ids = new Set<string>()
    for (const d of part) for (const id of d.students) ids.add(id)
    return {
      activeStudents: ids.size,
      creditsUsed: part.reduce((sum, d) => sum + d.creditsUsed, 0),
      submissions: part.reduce((sum, d) => sum + d.submissions, 0),
    }
  }

  return {
    range: { from: fromIso, to: toIso, days },
    weeks: { thisWeek: week(dayList.slice(-7)), lastWeek: week(dayList.slice(-14, -7)) },
    timezone,
    totals: {
      creditsUsed,
      creditsByKind,
      creditsPurchased,
      students: activeMembers.filter((m) => m.role === 'student').length,
      activeStudents: activeStudentIds.size,
      teachers: activeMembers.filter((m) => m.role === 'teacher').length,
      activeTeachers: activeTeacherIds.size,
      tutorSessions,
      lessonsStudied: runs.length,
      homeworkSubmitted: attempts.length,
      lessonsPublished: new Set(publications.map((p) => p.lesson_id as string)).size,
      homeworkSet,
      liveClassesHeld,
    },
    daily: dayList.map(({ students: set, ...d }) => ({ ...d, activeStudents: set.size })),
    people: peopleList,
    teachers: teacherList,
    subjects,
  }
}

/**
 * Lessons, homework and studying per subject on the school's list. Lessons
 * and homework whose typed subject isn't on the list count under "Other".
 */
export function subjectActivity(
  list: Awaited<ReturnType<typeof listSubjects>>,
  rows: { lessons: Row[]; homeworks: Row[]; publications: Row[]; runs: Row[]; attempts: Row[]; fromIso: string; toIso: string },
): SubjectActivity[] {
  if (list.length === 0) return []
  const byId = new Map(list.map((s) => [s.id, s]))
  const out = new Map<string, SubjectActivity & { students: Set<string> }>()
  const entry = (subjectId: string | null) => {
    const k = subjectId ?? 'other'
    let e = out.get(k)
    if (!e) {
      const s = subjectId ? byId.get(subjectId) : null
      e = { subjectId, name: s?.name ?? 'Other', color: s?.color ?? null, lessons: 0, lessonsPublished: 0, homeworkSet: 0, studentsStudying: 0, homeworkSubmitted: 0, students: new Set() }
      out.set(k, e)
    }
    return e
  }
  const subjectOf = (id: unknown, text: unknown) =>
    (typeof id === 'string' && byId.has(id) ? id : null) ?? matchSubject(typeof text === 'string' ? text : null, list)?.id ?? null

  for (const s of list) if (!s.archived) entry(s.id)
  const lessonSubject = new Map<string, string | null>()
  for (const l of rows.lessons) {
    const id = subjectOf(l.subject_id, l.subject)
    lessonSubject.set(l.id as string, id)
    entry(id).lessons += 1
  }
  for (const id of new Set(rows.publications.map((p) => p.lesson_id as string))) {
    if (lessonSubject.has(id)) entry(lessonSubject.get(id)!).lessonsPublished += 1
  }
  for (const r of rows.runs) {
    if (lessonSubject.has(r.lesson_id as string)) entry(lessonSubject.get(r.lesson_id as string)!).students.add(r.student_id as string)
  }
  const homeworkSubject = new Map<string, string | null>()
  for (const h of rows.homeworks) {
    const id = subjectOf(null, h.subject)
    homeworkSubject.set(h.id as string, id)
    if (h.status !== 'published' || !h.published_at) continue
    if (String(h.published_at) < rows.fromIso || String(h.published_at) >= rows.toIso) continue
    entry(id).homeworkSet += 1
  }
  for (const a of rows.attempts) {
    if (homeworkSubject.has(a.homework_id as string)) entry(homeworkSubject.get(a.homework_id as string)!).homeworkSubmitted += 1
  }
  return [...out.values()]
    .map(({ students, ...e }) => ({ ...e, studentsStudying: students.size }))
    .filter((e) => e.subjectId || e.lessons + e.homeworkSet + e.homeworkSubmitted + e.studentsStudying > 0)
    .sort((a, b) => (a.subjectId ? 0 : 1) - (b.subjectId ? 0 : 1) || a.name.localeCompare(b.name))
}
