import { describe, expect, it } from 'vitest'
import { assessmentColumns, assessmentInputSchema, gradeSubmission, mapAssessment, normalizeQuestions, type AssessmentRow } from '@/lib/assessments'

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
