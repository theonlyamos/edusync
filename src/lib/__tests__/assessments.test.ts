import { describe, expect, it } from 'vitest'
import { assessmentColumns, assessmentInputSchema, gradeSubmission, mapAssessment, seededShuffle, normalizeQuestions, type AssessmentRow } from '@/lib/assessments'

const input = {
  title: 'Fractions check',
  subject: 'Mathematics',
  gradeLevel: 'jhs 1',
  type: 'quiz',
  duration: 20,
  passingScore: 50,
  questions: [
    { question: 'Half of 10?', type: 'multiple_choice', options: ['2', '5', '', '10'], correctAnswer: '5', points: 2 },
    { question: '1/2 = 0.5', type: 'true_false', correctAnswer: 'True', points: 1 },
    { question: 'Name the top number', type: 'short_answer', correctAnswer: 'Numerator', points: 3 },
  ],
}

const row = (overrides: Partial<AssessmentRow> = {}): AssessmentRow => ({
  id: 'a-1',
  title: 'Fractions check',
  description: null,
  subject: 'Mathematics',
  gradelevel: 'jhs 1',
  type: 'quiz',
  duration: 20,
  totalpoints: 6,
  passingscore: 50,
  questions: normalizeQuestions(assessmentInputSchema.parse(input).questions, (() => { let n = 0; return () => `q-${++n}` })()),
  createdby: 't-1',
  created_at: '2026-10-22T10:00:00Z',
  is_published: true,
  ...overrides,
})

describe('assessment input', () => {
  it('computes total points from the questions and gives every question an id', () => {
    const columns = assessmentColumns(assessmentInputSchema.parse(input))
    expect(columns.totalpoints).toBe(6)
    expect(columns.gradelevel).toBe('jhs 1')
    expect(columns.questions.every((q) => q._id)).toBe(true)
    expect(columns.questions[0].options).toEqual(['2', '5', '10'])
    expect(columns.questions[1].correctAnswer).toBe('true')
  })

  it('rejects a multiple choice answer that is not one of the options', () => {
    const bad = { ...input, questions: [{ ...input.questions[0], correctAnswer: '7' }] }
    expect(assessmentInputSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects grades that are not school grades', () => {
    expect(assessmentInputSchema.safeParse({ ...input, gradeLevel: 'Grade 7' }).success).toBe(false)
  })
})

describe('grading', () => {
  it('marks answers case- and space-insensitively and scores unanswered questions as zero', () => {
    const result = gradeSubmission(row().questions, [
      { questionId: 'q-1', answer: '5' },
      { questionId: 'q-3', answer: '  numerator ' },
      { questionId: 'not-a-question', answer: 'x' },
    ])
    expect(result.totalScore).toBe(5)
    expect(result.totalPoints).toBe(6)
    expect(result.percentage).toBe(83.3)
    expect(result.graded.map((g) => g.isCorrect)).toEqual([true, false, true])
  })
})

describe('mapAssessment', () => {
  it('never sends students the answer key', () => {
    const forStudent = mapAssessment(row(), { includeAnswers: false })
    expect(JSON.stringify(forStudent)).not.toContain('Numerator')
    expect(forStudent.questions[0]).not.toHaveProperty('correctAnswer')
    expect(forStudent.gradeLevel).toBe('jhs 1')
    expect(forStudent._id).toBe('a-1')
  })

  it('gives the author the answer key', () => {
    expect(mapAssessment(row(), { includeAnswers: true }).questions[2].correctAnswer).toBe('Numerator')
  })
})

describe('per-student order', () => {
  const letters = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']

  it('shuffles the same way for the same seed and keeps every item', () => {
    const once = seededShuffle(letters, 'student-1:a-1')
    expect(seededShuffle(letters, 'student-1:a-1')).toEqual(once)
    expect([...once].sort()).toEqual(letters)
    expect(letters).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'])
  })

  it('gives different students different orders', () => {
    const orders = new Set(['s-1', 's-2', 's-3', 's-4', 's-5', 's-6'].map((id) => seededShuffle(letters, `${id}:a-1`).join('')))
    expect(orders.size).toBeGreaterThan(3)
  })

  it('reorders questions and choices for a student without leaking answers', () => {
    const plain = mapAssessment(row(), { includeAnswers: false })
    const seeds = ['s-1:a-1', 's-2:a-1', 's-3:a-1', 's-4:a-1', 's-5:a-1', 's-6:a-1']
    const shuffled = seeds.map((shuffleSeed) => mapAssessment(row(), { includeAnswers: false, shuffleSeed }))
    for (const view of shuffled) {
      expect(view.questions.map((q) => q._id).sort()).toEqual(plain.questions.map((q) => q._id).sort())
      expect(JSON.stringify(view.questions)).not.toContain('correctAnswer')
      const choice = view.questions.find((q) => q.type === 'multiple_choice') as { options?: string[] }
      expect([...(choice.options ?? [])].sort()).toEqual(['10', '2', '5'])
    }
    expect(new Set(shuffled.map((view) => view.questions.map((q) => q._id).join())).size).toBeGreaterThan(1)
  })

  it('keeps the written order for the teacher', () => {
    const teacher = mapAssessment(row(), { includeAnswers: true, shuffleSeed: 's-1:a-1' })
    expect(teacher.questions.map((q) => q._id)).toEqual(['q-1', 'q-2', 'q-3'])
  })
})
