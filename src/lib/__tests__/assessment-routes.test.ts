import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeSupabase } from './helpers/fake-supabase'

const mocks = vi.hoisted(() => ({ session: vi.fn(), serverSupabase: vi.fn(), schoolOf: vi.fn() }))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/auth', () => ({ getServerSession: mocks.session }))
vi.mock('@/lib/supabase.server', () => ({ createServerSupabase: mocks.serverSupabase, createSSRUserSupabase: vi.fn() }))
vi.mock('@/lib/school', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/school')>()),
  getUserSchoolId: (_db: unknown, userId: string) => Promise.resolve(mocks.schoolOf(userId)),
}))

const list = await import('@/app/api/assessments/route')
const one = await import('@/app/api/assessments/[id]/route')
const submit = await import('@/app/api/assessments/[id]/submit/route')
const results = await import('@/app/api/assessments/[id]/results/route')

const A = '11111111-1111-4111-8111-111111111111'
const DRAFT = '22222222-2222-4222-8222-222222222222'
const OTHER_SCHOOL = '33333333-3333-4333-8333-333333333333'
const request = (body?: unknown, method = 'GET') =>
  new NextRequest('https://app.test/api/assessments', { method, ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }) })
const params = (id: string) => ({ params: Promise.resolve({ id }) })
const as = (id: string, role: string) => mocks.session.mockResolvedValue({ user: { id, role, name: id, email: `${id}@test` } })

const questions = [
  { _id: 'q1', question: '2+2?', type: 'multiple_choice', options: ['3', '4'], correctAnswer: '4', points: 2 },
  { _id: 'q2', question: 'Sky colour', type: 'short_answer', correctAnswer: 'Blue', points: 2 },
]
const assessment = (id: string, overrides = {}) => ({
  id, title: 'Quiz', description: '', subject: 'Maths', gradelevel: 'jhs 1', type: 'quiz', duration: 10,
  totalpoints: 4, passingscore: 50, questions, createdby: 'teacher-1', created_at: '2026-10-22T00:00:00Z',
  is_published: true, due_date: null, organization_id: 'school-1', ...overrides,
})

let fake: ReturnType<typeof fakeSupabase>
beforeEach(() => {
  vi.clearAllMocks()
  fake = fakeSupabase({
    assessments: [
      assessment(A),
      assessment(DRAFT, { is_published: false }),
      assessment(OTHER_SCHOOL, { organization_id: 'school-2', createdby: 'teacher-9' }),
    ],
    assessment_results: [],
    students: [{ user_id: 'student-1', grade: 'JHS 1' }, { user_id: 'student-2', grade: 'jhs 2' }],
    users: [{ id: 'teacher-1', name: 'Kwame', email: 'k@test' }, { id: 'student-1', name: 'Ama', email: 'a@test' }],
  })
  mocks.serverSupabase.mockReturnValue(fake.client)
  mocks.schoolOf.mockImplementation((userId: string) => (userId === 'teacher-9' ? 'school-2' : 'school-1'))
})

describe('assessments for students', () => {
  it('lists only published assessments in their school and grade, without answers', async () => {
    as('student-1', 'student')
    const body = await (await list.GET(request())).json()
    expect(body.map((a: { id: string }) => a.id)).toEqual([A])
    expect(JSON.stringify(body)).not.toContain('correctAnswer')
  })

  it('hides drafts, other grades and other schools', async () => {
    as('student-1', 'student')
    expect((await one.GET(request(), params(DRAFT))).status).toBe(404)
    expect((await one.GET(request(), params(OTHER_SCHOOL))).status).toBe(404)
    as('student-2', 'student')
    expect((await one.GET(request(), params(A))).status).toBe(404)
  })

  it('grades a submission once and returns only their own result', async () => {
    as('student-1', 'student')
    const answers = [{ questionId: 'q1', answer: '4' }, { questionId: 'q2', answer: 'green' }]
    const first = await submit.POST(request({ answers }, 'POST'), params(A))
    expect(first.status).toBe(200)
    const { result } = await first.json()
    expect(result).toMatchObject({ totalScore: 2, percentage: 50, status: 'passed' })
    expect((await submit.POST(request({ answers }, 'POST'), params(A))).status).toBe(409)
    expect(await (await results.GET(request(), params(A))).json()).toMatchObject({ percentage: 50 })
  })

  it('cannot create, publish or delete', async () => {
    as('student-1', 'student')
    expect((await list.POST(request({}, 'POST'))).status).toBe(403)
    expect((await one.PUT(request({ isPublished: false }, 'PUT'), params(A))).status).toBe(403)
    expect((await one.DELETE(request(undefined, 'DELETE'), params(A))).status).toBe(403)
  })
})

describe('assessments for teachers', () => {
  it('creates a draft in their school with total points from the questions', async () => {
    as('teacher-1', 'teacher')
    const response = await list.POST(request({
      title: 'New', subject: 'Maths', gradeLevel: 'jhs 1', type: 'quiz', duration: 5, passingScore: 60,
      questions: [{ question: 'Q', type: 'short_answer', correctAnswer: 'A', points: 3 }],
    }, 'POST'))
    expect(response.status).toBe(201)
    const created = fake.tables.assessments.at(-1)!
    expect(created).toMatchObject({ createdby: 'teacher-1', organization_id: 'school-1', is_published: false, totalpoints: 3 })
  })

  it('publishes their own assessment but not a colleague\'s, and cannot see other schools', async () => {
    as('teacher-1', 'teacher')
    expect((await one.PUT(request({ isPublished: true }, 'PUT'), params(DRAFT))).status).toBe(200)
    expect(fake.tables.assessments.find((a) => a.id === DRAFT)!.is_published).toBe(true)
    expect((await one.GET(request(), params(OTHER_SCHOOL))).status).toBe(404)
    as('teacher-2', 'teacher')
    expect((await one.PUT(request({ isPublished: false }, 'PUT'), params(A))).status).toBe(403)
    expect((await results.GET(request(), params(A))).status).toBe(403)
  })

  it('will not change questions after students have submitted', async () => {
    fake.tables.assessment_results.push({ id: 'r1', assessmentid: A, studentid: 'student-1', answers: [] })
    as('teacher-1', 'teacher')
    const response = await one.PUT(request({
      title: 'Quiz', subject: 'Maths', gradeLevel: 'jhs 1', type: 'quiz', duration: 10, passingScore: 50,
      questions: [{ question: 'Q', type: 'short_answer', correctAnswer: 'A', points: 1 }],
    }, 'PUT'), params(A))
    expect(response.status).toBe(409)
  })
})
