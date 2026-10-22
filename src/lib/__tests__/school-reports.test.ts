import { describe, expect, it } from 'vitest'
import { dayKey, netUsage, parseReportRange, percentChange, periodDays, reportPeopleCsv } from '@/lib/school-reports'
import { getSchoolReport } from '@/lib/school-reports.server'
import { fakeSupabase } from './helpers/fake-supabase'

describe('report helpers', () => {
  it('only accepts the offered ranges', () => {
    expect(parseReportRange('7')).toBe(7)
    expect(parseReportRange('365')).toBe(365)
    expect(parseReportRange('12')).toBe(30)
    expect(parseReportRange(null)).toBe(30)
  })

  it('counts usage net of refunds', () => {
    expect(netUsage({ credits: -10, refunded_credits: 4 })).toBe(6)
    expect(netUsage({ credits: -3, refunded_credits: 5 })).toBe(0)
  })

  it('buckets days in the school time zone', () => {
    // 23:30 UTC is already the next day in Nairobi (UTC+3).
    expect(dayKey('2026-10-21T23:30:00Z', 'UTC')).toBe('2026-10-21')
    expect(dayKey('2026-10-21T23:30:00Z', 'Africa/Nairobi')).toBe('2026-10-22')
    expect(dayKey('2026-10-21T23:30:00Z', 'Not/AZone')).toBe('2026-10-21')
    expect(periodDays(new Date('2026-10-22T12:00:00Z'), 3, 'UTC')).toEqual(['2026-10-20', '2026-10-21', '2026-10-22'])
  })

  it('compares with the previous period only when there was one', () => {
    expect(percentChange(15, 10)).toBe(50)
    expect(percentChange(5, 10)).toBe(-50)
    expect(percentChange(5, 0)).toBeNull()
  })

  it('writes a CSV that spreadsheets cannot run as a formula', () => {
    const csv = reportPeopleCsv({
      people: [{
        userId: 'u1', name: '=HYPERLINK("x")', email: 'a@x.test', role: 'student', grade: 'jhs 1', isActive: true,
        credits: { voice: 5, live_class: 0, visual: 0, image: 0, total: 5 }, visuals: 0, images: 0,
        tutorSessions: 1, lessonsStudied: 2, homeworkSubmitted: 0, lastActiveAt: null,
      }],
    })
    const row = csv.split('\n')[1]
    expect(row.startsWith('=')).toBe(false)
    expect(row).toContain('a@x.test')
  })
})

describe('getSchoolReport', () => {
  const now = new Date('2026-10-22T12:00:00Z')

  function setup() {
    return fakeSupabase({
      organization_members: [
        { organization_id: 's1', user_id: 'stu1', role: 'student', is_active: true },
        { organization_id: 's1', user_id: 'stu2', role: 'student', is_active: true },
        { organization_id: 's1', user_id: 'tea1', role: 'teacher', is_active: true },
        { organization_id: 's1', user_id: 'own1', role: 'owner', is_active: true },
      ],
      students: [
        { organization_id: 's1', user_id: 'stu1', grade: 'jhs 1' },
        { organization_id: 's1', user_id: 'stu2', grade: 'jhs 2' },
      ],
      teachers: [{ id: 't1', organization_id: 's1', user_id: 'tea1' }],
      users: [
        { id: 'stu1', name: 'Ama', email: 'ama@x.test' },
        { id: 'stu2', name: 'Kofi', email: 'kofi@x.test' },
        { id: 'tea1', name: 'Mr Mensah', email: 'mensah@x.test' },
        { id: 'own1', name: 'Mrs Owusu', email: 'owusu@x.test' },
        { id: 'gone', name: 'Left Already', email: 'gone@x.test' },
      ],
      organization_credit_transactions: [
        { organization_id: 's1', user_id: 'stu1', transaction_type: 'usage', usage_kind: 'voice', credits: -12, refunded_credits: 2, created_at: '2026-10-21T09:00:00Z' },
        { organization_id: 's1', user_id: 'tea1', transaction_type: 'usage', usage_kind: 'live_class', credits: -30, refunded_credits: 0, created_at: '2026-10-20T09:00:00Z' },
        { organization_id: 's1', user_id: 'gone', transaction_type: 'usage', usage_kind: 'voice', credits: -5, refunded_credits: 0, created_at: '2026-10-19T09:00:00Z' },
        { organization_id: 's1', user_id: 'own1', transaction_type: 'purchase', usage_kind: null, credits: 100, refunded_credits: 0, created_at: '2026-10-18T09:00:00Z' },
        // Outside the period.
        { organization_id: 's1', user_id: 'stu1', transaction_type: 'usage', usage_kind: 'voice', credits: -50, refunded_credits: 0, created_at: '2026-09-01T09:00:00Z' },
        // Another school.
        { organization_id: 's2', user_id: 'stu1', transaction_type: 'usage', usage_kind: 'voice', credits: -50, refunded_credits: 0, created_at: '2026-10-21T09:00:00Z' },
      ],
      organization_ai_usage: [
        { organization_id: 's1', user_id: 'tea1', category: 'interactive_generation', quantity: 3, refunded_at: null, reference_id: 'a', created_at: '2026-10-21T09:00:00Z' },
        { organization_id: 's1', user_id: 'tea1', category: 'image_generation', quantity: 1, refunded_at: '2026-10-21T10:00:00Z', reference_id: 'b', created_at: '2026-10-21T09:00:00Z' },
      ],
      homeworks: [{ id: 'h1', organization_id: 's1', owner_id: 'tea1', status: 'published', published_at: '2026-10-15T09:00:00Z' }],
      homework_attempts: [
        { homework_id: 'h1', student_id: 'stu2', submitted_at: '2026-10-21T15:00:00Z' },
        { homework_id: 'h1', student_id: 'stu1', submitted_at: null },
      ],
      lessons: [{ id: 'l1', organization_id: 's1', teacher_id: 't1', created_at: '2026-10-10T09:00:00Z' }],
      lesson_publications: [{ lesson_id: 'l1', published_by: 'tea1', published_at: '2026-10-11T09:00:00Z' }],
      learning_runs: [
        { student_id: 'stu1', lesson_id: 'l1', created_at: '2026-10-21T09:05:00Z' },
        { student_id: 'stu1', lesson_id: 'l1', created_at: '2026-10-22T09:05:00Z' },
      ],
      learning_sessions: [
        { user_id: 'stu1', created_at: '2026-10-21T09:00:00Z', live_class_event_id: null },
        { user_id: 'stu2', created_at: '2026-10-20T09:00:00Z', live_class_event_id: 'e1' },
      ],
      live_class_events: [
        { organization_id: 's1', organizer_id: 'tea1', status: 'ended', scheduled_start_at: '2026-10-20T09:00:00Z' },
        { organization_id: 's1', organizer_id: 'tea1', status: 'cancelled', scheduled_start_at: '2026-10-19T09:00:00Z' },
      ],
    })
  }

  it('adds up credits, studying and teaching for the period', async () => {
    const fake = setup()
    const report = await getSchoolReport(fake.client, { id: 's1', timezone: 'UTC' }, { days: 30, now })

    expect(report.totals.creditsUsed).toBe(10 + 30 + 5)
    expect(report.totals.creditsByKind).toEqual({ voice: 15, live_class: 30, visual: 0, image: 0 })
    expect(report.totals.creditsPurchased).toBe(100)
    expect(report.totals.students).toBe(2)
    expect(report.totals.activeStudents).toBe(2)
    expect(report.totals.tutorSessions).toBe(1)
    expect(report.totals.homeworkSubmitted).toBe(1)
    expect(report.totals.homeworkSet).toBe(1)
    expect(report.totals.lessonsPublished).toBe(1)
    expect(report.totals.liveClassesHeld).toBe(1)

    const ama = report.people.find((p) => p.userId === 'stu1')!
    expect(ama).toMatchObject({ name: 'Ama', grade: 'jhs 1', tutorSessions: 1, lessonsStudied: 1, homeworkSubmitted: 0 })
    expect(ama.credits.voice).toBe(10)
    expect(ama.lastActiveAt).toBe('2026-10-22T09:05:00Z')

    const former = report.people.find((p) => p.userId === 'gone')!
    expect(former).toMatchObject({ role: 'former', name: 'Left Already' })

    const teacher = report.teachers.find((t) => t.userId === 'tea1')!
    expect(teacher).toMatchObject({ lessonsCreated: 1, lessonsPublished: 1, homeworkSet: 1, liveClassesHeld: 1, creditsUsed: 30 })
    expect(report.people.find((p) => p.userId === 'tea1')).toMatchObject({ visuals: 3, images: 0 })

    expect(report.daily).toHaveLength(30)
    const oct21 = report.daily.find((d) => d.date === '2026-10-21')!
    expect(oct21).toEqual({ date: '2026-10-21', activeStudents: 2, creditsUsed: 10, submissions: 1 })
    expect(report.weeks.thisWeek).toEqual({ activeStudents: 2, creditsUsed: 45, submissions: 1 })
  })
})
