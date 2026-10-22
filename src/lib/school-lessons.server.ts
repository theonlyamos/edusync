import type { ServiceSupabase } from '@/lib/school-access.server'

export type SchoolLessonStatus = 'published' | 'draft' | 'archived'

export type SchoolLesson = {
  id: string
  title: string
  subject: string
  gradeLevel: string | null
  teacher: { userId: string; name: string } | null
  status: SchoolLessonStatus
  /** The live version and when it went out, for published lessons. */
  version: number | null
  publishedAt: string | null
  updatedAt: string
  createdAt: string
  homeworkSet: number
  /** Students who have opened the lesson. */
  studentsStarted: number
}

const CHUNK = 200

function chunks<T>(items: readonly T[], size = CHUNK): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export function lessonStatus(lesson: { archived_at: string | null; current_publication_id: string | null }): SchoolLessonStatus {
  if (lesson.archived_at) return 'archived'
  return lesson.current_publication_id ? 'published' : 'draft'
}

/** Every lesson in the school with its teacher and how it's being used. Callers must check the viewer manages this school. */
export async function listSchoolLessons(supabase: ServiceSupabase, schoolId: string): Promise<SchoolLesson[]> {
  const { data: lessons, error } = await supabase
    .from('lessons')
    .select('id, title, subject, gradelevel, teacher_id, current_publication_id, archived_at, created_at, updated_at')
    .eq('organization_id', schoolId)
    .order('updated_at', { ascending: false })
    .limit(5000)
  if (error) throw error
  const rows = lessons ?? []
  if (rows.length === 0) return []

  const teacherIds = [...new Set(rows.map((l) => l.teacher_id as string | null).filter((id): id is string => Boolean(id)))]
  const publicationIds = rows.map((l) => l.current_publication_id as string | null).filter((id): id is string => Boolean(id))
  const lessonIds = rows.map((l) => l.id as string)

  const teacherUser = new Map<string, string>()
  for (const ids of chunks(teacherIds)) {
    const { data, error: e } = await supabase.from('teachers').select('id, user_id').in('id', ids)
    if (e) throw e
    for (const t of data ?? []) teacherUser.set(t.id as string, t.user_id as string)
  }
  const names = new Map<string, string>()
  for (const ids of chunks([...new Set(teacherUser.values())])) {
    const { data, error: e } = await supabase.from('users').select('id, name, email').in('id', ids)
    if (e) throw e
    for (const u of data ?? []) names.set(u.id as string, (u.name as string | null)?.trim() || (u.email as string) || 'Teacher')
  }

  const publications = new Map<string, { version: number; publishedAt: string }>()
  for (const ids of chunks(publicationIds)) {
    const { data, error: e } = await supabase.from('lesson_publications').select('id, version, published_at').in('id', ids)
    if (e) throw e
    for (const p of data ?? []) publications.set(p.id as string, { version: p.version as number, publishedAt: p.published_at as string })
  }

  const homework = new Map<string, number>()
  const started = new Map<string, Set<string>>()
  for (const ids of chunks(lessonIds)) {
    const [hw, runs] = await Promise.all([
      supabase.from('homeworks').select('lesson_id').eq('organization_id', schoolId).eq('status', 'published').in('lesson_id', ids).limit(20000),
      supabase.from('learning_runs').select('lesson_id, student_id').in('lesson_id', ids).limit(50000),
    ])
    if (hw.error) throw hw.error
    if (runs.error) throw runs.error
    for (const h of hw.data ?? []) homework.set(h.lesson_id as string, (homework.get(h.lesson_id as string) ?? 0) + 1)
    for (const r of runs.data ?? []) {
      const set = started.get(r.lesson_id as string) ?? new Set<string>()
      set.add(r.student_id as string)
      started.set(r.lesson_id as string, set)
    }
  }

  return rows.map((l) => {
    const userId = l.teacher_id ? teacherUser.get(l.teacher_id as string) : undefined
    const publication = l.current_publication_id ? publications.get(l.current_publication_id as string) : undefined
    return {
      id: l.id as string,
      title: (l.title as string) || 'Untitled lesson',
      subject: (l.subject as string) || '',
      gradeLevel: (l.gradelevel as string | null) ?? null,
      teacher: userId ? { userId, name: names.get(userId) ?? 'Teacher' } : null,
      status: lessonStatus(l as { archived_at: string | null; current_publication_id: string | null }),
      version: publication?.version ?? null,
      publishedAt: publication?.publishedAt ?? null,
      updatedAt: l.updated_at as string,
      createdAt: l.created_at as string,
      homeworkSet: homework.get(l.id as string) ?? 0,
      studentsStarted: started.get(l.id as string)?.size ?? 0,
    }
  })
}

/** Whether the lesson belongs to this school. */
export async function findSchoolLesson(supabase: ServiceSupabase, schoolId: string, lessonId: string) {
  const { data, error } = await supabase
    .from('lessons')
    .select('id, archived_at, current_publication_id')
    .eq('id', lessonId)
    .eq('organization_id', schoolId)
    .maybeSingle()
  if (error) throw error
  return data
}
