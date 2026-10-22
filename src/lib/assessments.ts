import { z } from 'zod';
import { GRADE_LEVELS } from '@/lib/constants';

// Assessments are stored with lowercase column names (gradelevel, totalpoints, …).
// These helpers translate between the database rows and the camelCase shape the pages use.

export const ASSESSMENT_TYPES = ['quiz', 'exam', 'homework'] as const;
export const QUESTION_TYPES = ['multiple_choice', 'true_false', 'short_answer'] as const;

export interface AssessmentQuestion {
  _id: string;
  question: string;
  type: (typeof QUESTION_TYPES)[number];
  options?: string[];
  correctAnswer?: string;
  points: number;
  explanation?: string;
}

export interface AssessmentRow {
  id: string;
  title: string;
  description: string | null;
  subject: string;
  gradelevel: string;
  type: string;
  duration: number;
  totalpoints: number;
  passingscore: number;
  questions: unknown;
  createdby: string | null;
  created_at: string;
  updated_at?: string | null;
  is_published?: boolean | null;
  due_date?: string | null;
  lesson_id?: string | null;
  organization_id?: string | null;
}

export interface AssessmentResultRow {
  id: string;
  assessment_id: string;
  student_id: string;
  answers: unknown;
  score: number | null;
  percentage: number | string | null;
  status: string | null;
  startedat: string | null;
  submittedat: string | null;
  timespent: number | null;
}

const questionSchema = z
  .object({
    _id: z.string().max(80).optional(),
    question: z.string().trim().min(1, 'Every question needs text').max(2000),
    type: z.enum(QUESTION_TYPES),
    options: z.array(z.string().trim().max(500)).max(10).optional(),
    correctAnswer: z.string().trim().min(1, 'Every question needs a correct answer').max(1000),
    points: z.coerce.number().int().min(1).max(100),
    explanation: z.string().max(2000).optional(),
  })
  .superRefine((question, ctx) => {
    if (question.type === 'multiple_choice') {
      const options = (question.options ?? []).filter(Boolean);
      if (options.length < 2) {
        ctx.addIssue({ code: 'custom', message: 'Multiple choice questions need at least two options' });
      } else if (!options.includes(question.correctAnswer)) {
        ctx.addIssue({ code: 'custom', message: 'The correct answer must be one of the options' });
      }
    }
    if (question.type === 'true_false' && !['true', 'false'].includes(question.correctAnswer.toLowerCase())) {
      ctx.addIssue({ code: 'custom', message: 'True/false answers must be "true" or "false"' });
    }
  });

export const assessmentInputSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: z.string().max(2000).optional().default(''),
  subject: z.string().trim().min(1, 'Subject is required').max(100),
  gradeLevel: z.enum(GRADE_LEVELS, { message: 'Choose a grade' }),
  type: z.enum(ASSESSMENT_TYPES),
  duration: z.coerce.number().int().min(1).max(600),
  passingScore: z.coerce.number().min(0).max(100),
  questions: z.array(questionSchema).min(1, 'Add at least one question').max(100),
  dueDate: z.string().optional().nullable(),
  isPublished: z.boolean().optional(),
});
export type AssessmentInput = z.infer<typeof assessmentInputSchema>;

/** Give each question a stable id (answers and results refer to it) and drop empty options. */
export function normalizeQuestions(questions: AssessmentInput['questions'], makeId: () => string = () => crypto.randomUUID()): AssessmentQuestion[] {
  return questions.map((question) => ({
    _id: question._id || makeId(),
    question: question.question,
    type: question.type,
    ...(question.type === 'multiple_choice' ? { options: (question.options ?? []).filter(Boolean) } : {}),
    correctAnswer: question.type === 'true_false' ? question.correctAnswer.toLowerCase() : question.correctAnswer,
    points: question.points,
    ...(question.explanation ? { explanation: question.explanation } : {}),
  }));
}

export function parseDueDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('The due date is not a valid date');
  return date.toISOString();
}

/** Columns for an insert or update, from validated input. */
export function assessmentColumns(input: AssessmentInput) {
  const questions = normalizeQuestions(input.questions);
  return {
    title: input.title,
    description: input.description ?? '',
    subject: input.subject,
    gradelevel: input.gradeLevel,
    type: input.type,
    duration: input.duration,
    passingscore: input.passingScore,
    totalpoints: questions.reduce((sum, question) => sum + question.points, 0),
    questions,
    due_date: parseDueDate(input.dueDate),
    ...(input.isPublished === undefined ? {} : { is_published: input.isPublished }),
  };
}

function readQuestions(value: unknown): AssessmentQuestion[] {
  return Array.isArray(value) ? (value as AssessmentQuestion[]).filter((q) => q && typeof q === 'object') : [];
}

/** API shape. Students never get correct answers or explanations. */
export function mapAssessment(
  row: AssessmentRow,
  options: { includeAnswers: boolean; creator?: { name?: string | null; email?: string | null } | null; myResult?: { status: string | null; percentage: number } | null },
) {
  const questions = readQuestions(row.questions).map((question, index) => {
    const id = question._id || `q${index + 1}`;
    if (options.includeAnswers) return { ...question, _id: id };
    return {
      _id: id,
      question: question.question,
      type: question.type,
      ...(question.options ? { options: question.options } : {}),
      points: question.points,
    };
  });
  return {
    _id: row.id,
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    subject: row.subject,
    gradeLevel: row.gradelevel,
    type: row.type,
    duration: row.duration,
    totalPoints: row.totalpoints,
    passingScore: row.passingscore,
    dueDate: row.due_date ?? undefined,
    isPublished: Boolean(row.is_published),
    lessonId: row.lesson_id ?? undefined,
    createdAt: row.created_at,
    createdById: row.createdby,
    createdBy: { name: options.creator?.name ?? '', email: options.creator?.email ?? '' },
    questions,
    ...(options.myResult !== undefined ? { myResult: options.myResult } : {}),
  };
}

function normalizeAnswer(value: unknown) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Marks a submission. Unknown question ids are ignored; unanswered questions score zero. */
export function gradeSubmission(questionsValue: unknown, answers: { questionId: string; answer: string }[]) {
  const questions = readQuestions(questionsValue);
  const byQuestion = new Map(answers.map((answer) => [String(answer.questionId), String(answer.answer ?? '')]));
  const totalPoints = questions.reduce((sum, question) => sum + (Number(question.points) || 0), 0);
  let totalScore = 0;
  const graded = questions.map((question, index) => {
    const id = question._id || `q${index + 1}`;
    const answer = byQuestion.get(id) ?? '';
    const isCorrect = answer !== '' && normalizeAnswer(answer) === normalizeAnswer(question.correctAnswer);
    const points = isCorrect ? Number(question.points) || 0 : 0;
    totalScore += points;
    return { questionId: id, answer, isCorrect, points };
  });
  const percentage = totalPoints > 0 ? Math.round((totalScore / totalPoints) * 1000) / 10 : 0;
  return { graded, totalScore, totalPoints, percentage };
}

export function mapResult(row: AssessmentResultRow, student?: { name?: string | null; email?: string | null } | null) {
  return {
    _id: row.id,
    id: row.id,
    assessmentId: row.assessment_id,
    studentId: { _id: row.student_id, name: student?.name ?? 'Student', email: student?.email ?? '' },
    answers: Array.isArray(row.answers) ? row.answers : [],
    totalScore: row.score ?? 0,
    percentage: Number(row.percentage ?? 0),
    status: row.status === 'passed' ? 'passed' : 'failed',
    startedAt: row.startedat,
    submittedAt: row.submittedat,
    timeSpent: row.timespent ?? 0,
  };
}

export function resultStatistics(results: ReturnType<typeof mapResult>[]) {
  const totalSubmissions = results.length;
  if (!totalSubmissions) return { totalSubmissions, averageScore: 0, passRate: 0, averageTimeSpent: 0 };
  return {
    totalSubmissions,
    averageScore: results.reduce((sum, r) => sum + r.percentage, 0) / totalSubmissions,
    passRate: (results.filter((r) => r.status === 'passed').length / totalSubmissions) * 100,
    averageTimeSpent: results.reduce((sum, r) => sum + r.timeSpent, 0) / totalSubmissions,
  };
}
