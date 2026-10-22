import type { ServiceSupabase } from '@/lib/school-access.server'
import { GRADE_LEVELS } from '@/lib/constants'

export type SchoolOverview = {
  people: {
    students: number
    teachers: number
    administrators: number
    deactivated: number
    /** Accounts whose activation link hasn't been used yet. */
    waitingToActivate: number
  }
  studentsByGrade: Array<{ grade: string; count: number }>
  lessons: { published: number; drafts: number }
  homework: { publishedLast30Days: number; open: number }
  liveClasses: {
    upcomingThisWeek: number
    next: Array<{ id: string; title: string; startsAt: string; gradeLevel: string | null }>
  }
  recentlyAdded: Array<{ memberId: string; name: string; role: string; joinedAt: string }>
}

const DAY = 24 * 60 * 60 * 1000

/** The numbers on the school admin dashboard. Callers must check the viewer manages this school. */
export async function getSchoolOverview(supabase: ServiceSupabase, schoolId: string, now = new Date()): Promise<SchoolOverview> {
  const [membersResult, studentsResult, lessonsResult, homeworkResult, liveResult, linksResult] = await Promise.all([
    supabase.from('organization_members').select('id, user_id, role, is_active, joined_at').eq('organization_id', schoolId).limit(20000),
    supabase.from('students').select('user_id, grade').eq('organization_id', schoolId).limit(20000),
    supabase.from('lessons').select('current_publication_id').eq('organization_id', schoolId).is('archived_at', null).limit(20000),
    supabase.from('homeworks').select('status, published_at, close_at').eq('organization_id', schoolId).eq('status', 'published').limit(20000),
    supabase
      .from('live_class_events')
      .select('id, title, scheduled_start_at, grade_level, status')
      .eq('organization_id', schoolId)
      .in('status', ['scheduled', 'live'])
      .gte('scheduled_end_at', now.toISOString())
      .order('scheduled_start_at', { ascending: true })
      .limit(200),
    supabase.from('organization_invitations').select('email, accepted_at, revoked_at, expires_at').eq('organization_id', schoolId).limit(20000),
  ])
  for (const result of [membersResult, studentsResult, lessonsResult, homeworkResult, liveResult, linksResult]) {
    if (result.error) throw result.error
  }

  const members = membersResult.data ?? []
  const active = members.filter((m) => m.is_active)
  const activeStudentIds = new Set(active.filter((m) => m.role === 'student').map((m) => m.user_id as string))

  const gradeCounts = new Map<string, number>()
  for (const s of studentsResult.data ?? []) {
    if (!activeStudentIds.has(s.user_id as string)) continue
    const grade = (s.grade as string | null) ?? 'none'
    gradeCounts.set(grade, (gradeCounts.get(grade) ?? 0) + 1)
  }
  const order = (g: string) => {
    const i = (GRADE_LEVELS as readonly string[]).indexOf(g)
    return i === -1 ? 999 : i
  }
  const studentsByGrade = [...gradeCounts.entries()]
    .map(([grade, count]) => ({ grade, count }))
    .sort((a, b) => order(a.grade) - order(b.grade))

  // Emails with links, none of them used, and at least one still open.
  const byEmail = new Map<string, { used: boolean; open: boolean }>()
  for (const link of linksResult.data ?? []) {
    const entry = byEmail.get(link.email as string) ?? { used: false, open: false }
    if (link.accepted_at) entry.used = true
    else if (!link.revoked_at) entry.open = true
    byEmail.set(link.email as string, entry)
  }
  const waitingToActivate = [...byEmail.values()].filter((e) => !e.used && e.open).length

  const lessons = lessonsResult.data ?? []
  const homework = homeworkResult.data ?? []
  const live = liveResult.data ?? []
  const weekAhead = now.getTime() + 7 * DAY

  const recent = [...members].sort((a, b) => String(b.joined_at).localeCompare(String(a.joined_at))).slice(0, 6)
  const names = new Map<string, string>()
  if (recent.length > 0) {
    const { data: users, error } = await supabase.from('users').select('id, name, email').in('id', recent.map((m) => m.user_id as string))
    if (error) throw error
    for (const u of users ?? []) names.set(u.id as string, (u.name as string | null)?.trim() || (u.email as string) || 'Someone')
  }

  return {
    people: {
      students: active.filter((m) => m.role === 'student').length,
      teachers: active.filter((m) => m.role === 'teacher').length,
      administrators: active.filter((m) => m.role === 'admin' || m.role === 'owner').length,
      deactivated: members.length - active.length,
      waitingToActivate,
    },
    studentsByGrade,
    lessons: {
      published: lessons.filter((l) => l.current_publication_id).length,
      drafts: lessons.filter((l) => !l.current_publication_id).length,
    },
    homework: {
      publishedLast30Days: homework.filter((h) => h.published_at && new Date(h.published_at as string).getTime() >= now.getTime() - 30 * DAY).length,
      open: homework.filter((h) => !h.close_at || new Date(h.close_at as string).getTime() > now.getTime()).length,
    },
    liveClasses: {
      upcomingThisWeek: live.filter((e) => new Date(e.scheduled_start_at as string).getTime() <= weekAhead).length,
      next: live.slice(0, 4).map((e) => ({
        id: e.id as string,
        title: (e.title as string) || 'Live class',
        startsAt: e.scheduled_start_at as string,
        gradeLevel: (e.grade_level as string | null) ?? null,
      })),
    },
    recentlyAdded: recent.map((m) => ({
      memberId: m.id as string,
      name: names.get(m.user_id as string) ?? 'Someone',
      role: m.role as string,
      joinedAt: m.joined_at as string,
    })),
  }
}
