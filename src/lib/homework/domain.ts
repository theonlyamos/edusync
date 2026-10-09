import { z } from "zod";

const questionId = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
export const questionSchema = z
  .object({
    id: questionId,
    type: z.enum([
      "multiple_choice",
      "multiple_select",
      "true_false",
      "short_answer",
      "written",
      "file",
    ]),
    prompt: z.string().trim().min(1).max(5000),
    objectiveId: z.string().uuid(),
    points: z.number().int().min(1).max(100),
    required: z.boolean().default(true),
    options: z.array(z.string().trim().min(1).max(500)).max(8).default([]),
    rubric: z
      .array(
        z.object({
          label: z.string().trim().min(1).max(300),
          points: z.number().int().min(1).max(100),
        }),
      )
      .max(20)
      .default([]),
    correctAnswer: z
      .union([
        z.string().trim().max(1000),
        z.array(z.string().trim().min(1).max(500)).max(8),
      ])
      .default(""),
    guidance: z.string().max(5000).default(""),
  })
  .superRefine((q, ctx) => {
    if (["multiple_choice", "multiple_select", "true_false"].includes(q.type)) {
      const opts = q.type === "true_false" ? ["True", "False"] : q.options;
      const answers = Array.isArray(q.correctAnswer)
        ? q.correctAnswer
        : [q.correctAnswer];
      if (
        opts.length < 2 ||
        new Set(opts).size !== opts.length ||
        (q.type === "multiple_select") !== Array.isArray(q.correctAnswer) ||
        !answers.length ||
        new Set(answers).size !== answers.length ||
        answers.some((answer) => !opts.includes(answer))
      )
        ctx.addIssue({
          code: "custom",
          message:
            "Choice questions need distinct options and matching correct answers",
        });
    }
    if (
      q.rubric.length &&
      q.rubric.reduce((n, r) => n + r.points, 0) !== q.points
    )
      ctx.addIssue({
        code: "custom",
        message: "Rubric marks must sum to the question maximum",
      });
    if (
      !["multiple_choice", "multiple_select", "true_false"].includes(q.type) &&
      Array.isArray(q.correctAnswer)
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Only multiple-answer questions accept a list of correct answers",
      });
    if (
      ["multiple_choice", "multiple_select", "true_false"].includes(q.type) &&
      q.rubric.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Choice questions do not use a marking rubric",
      });
  });
export const draftSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    instructions: z.string().trim().min(1).max(10000),
    lessonId: z.string().uuid(),
    publicationId: z.string().uuid().optional(),
    objectiveIds: z.array(z.string().uuid()).min(1).max(20),
    questions: z.array(questionSchema).min(1).max(50),
    dueAt: z.string().datetime({ offset: true }),
    closeAt: z.string().datetime({ offset: true }).nullable().default(null),
    timezone: z.string().max(80).default("UTC"),
    acceptLate: z.boolean().default(true),
    allowHints: z.boolean().default(false),
    allowReferences: z.boolean().default(true),
    minutes: z.number().int().min(1).max(600).default(30),
  })
  .superRefine((d, ctx) => {
    if (new Set(d.questions.map((q) => q.id)).size !== d.questions.length)
      ctx.addIssue({ code: "custom", message: "Question IDs must be unique" });
    if (d.questions.some((q) => !d.objectiveIds.includes(q.objectiveId)))
      ctx.addIssue({
        code: "custom",
        message: "Every question needs a selected objective",
      });
    if (d.closeAt && Date.parse(d.closeAt) < Date.parse(d.dueAt))
      ctx.addIssue({
        code: "custom",
        message: "Closing date must not precede the due date",
      });
    try {
      new Intl.DateTimeFormat("en", { timeZone: d.timezone });
    } catch {
      ctx.addIssue({
        code: "custom",
        message: "Choose a valid school timezone",
      });
    }
  });
export type DraftQuestion = z.infer<typeof questionSchema>;
export type HomeworkDraft = z.infer<typeof draftSchema>;
export type Question = Omit<DraftQuestion, "correctAnswer" | "guidance">;
export type Keys = Record<
  string,
  Pick<DraftQuestion, "correctAnswer" | "guidance">
>;
export const answersSchema = z.record(
  questionId,
  z.union([z.string().max(30000), z.array(z.string().min(1).max(500)).max(8)]),
);
export type Answers = z.infer<typeof answersSchema>;
export const markSchema = z.object({
  score: z.number().min(0).max(100),
  feedback: z.string().max(5000).default(""),
  criteria: z.array(z.number().min(0).max(100)).max(20).optional(),
  overrideReason: z.string().max(1000).optional(),
});
export const marksSchema = z.record(questionId, markSchema);
export type Marks = z.infer<typeof marksSchema>;

export function splitQuestions(input: unknown[]) {
  const parsed = input.map((q) => questionSchema.parse(q));
  const questions: Question[] = parsed.map((q) => ({
    id: q.id,
    type: q.type,
    prompt: q.prompt,
    objectiveId: q.objectiveId,
    points: q.points,
    required: q.required,
    options: q.type === "true_false" ? ["True", "False"] : q.options,
    rubric: q.rubric,
  }));
  const keys: Keys = Object.fromEntries(
    parsed.map((q) => [
      q.id,
      { correctAnswer: q.correctAnswer, guidance: q.guidance },
    ]),
  );
  return { questions, keys };
}
export function validateAnswers(
  questions: Question[],
  input: unknown,
  complete = false,
): Answers {
  const answers = answersSchema.parse(input),
    known = new Map(questions.map((q) => [q.id, q]));
  for (const id of Object.keys(answers))
    if (!known.has(id)) throw new Error("Unknown question in answers");
  for (const q of questions) {
    const value = answers[q.id];
    const empty =
      value === undefined ||
      (typeof value === "string" ? !value.trim() : value.length === 0);
    if (complete && q.required && empty)
      throw new Error(`A response is required for: ${q.prompt}`);
    if (empty) continue;
    if (q.type === "file") {
      const ids = z.array(z.string().uuid()).max(3).parse(value);
      if (new Set(ids).size !== ids.length)
        throw new Error("Attachment IDs must be distinct");
      continue;
    }
    if (q.type === "multiple_select") {
      if (
        !Array.isArray(value) ||
        new Set(value).size !== value.length ||
        value.some((option) => !q.options.includes(option))
      )
        throw new Error("Select distinct available choices");
      continue;
    }
    if (typeof value !== "string")
      throw new Error("This question requires a text answer");
    if (
      ["multiple_choice", "true_false"].includes(q.type) &&
      !q.options.includes(value as string)
    )
      throw new Error("Invalid choice answer");
  }
  return answers;
}
export function validateMarks(
  questions: Question[],
  input: unknown,
  complete = false,
): Marks {
  const marks = marksSchema.parse(input),
    known = new Map(questions.map((q) => [q.id, q]));
  for (const [id, mark] of Object.entries(marks)) {
    const q = known.get(id);
    if (!q) throw new Error("Unknown question in marks");
    if (mark.score > q.points)
      throw new Error("Score exceeds the question maximum");
    if (
      q.rubric.length &&
      (!mark.criteria ||
        mark.criteria.length !== q.rubric.length ||
        mark.criteria.some((n, i) => n > q.rubric[i].points) ||
        mark.criteria.reduce((n, v) => n + v, 0) !== mark.score)
    )
      throw new Error("Rubric criterion scores must sum to the question score");
  }
  if (complete && questions.some((q) => !marks[q.id]))
    throw new Error("Mark every question before releasing feedback");
  return marks;
}
export function provisionalMarks(
  questions: Question[],
  keys: Keys,
  answers: Answers,
): Marks {
  return Object.fromEntries(
    questions
      .filter((q) =>
        ["multiple_choice", "multiple_select", "true_false"].includes(q.type),
      )
      .map((q) => {
        const answer = answers[q.id],
          key = keys[q.id]?.correctAnswer;
        const correct =
          q.type === "multiple_select"
            ? Array.isArray(answer) &&
              Array.isArray(key) &&
              key.length > 0 &&
              answer.length === key.length &&
              new Set(answer).size === answer.length &&
              answer.every((option) => key.includes(option))
            : typeof answer === "string" && answer === key;
        return [
          q.id,
          {
            score: correct ? q.points : 0,
            feedback: "",
          },
        ];
      }),
  );
}
export const FILE_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};
export function validateFile(name: string, mime: string, size: number) {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  if (!FILE_TYPES[extension] || FILE_TYPES[extension] !== mime)
    throw new Error("Choose a PDF, JPG, PNG or DOCX file");
  if (size <= 0 || size > 10 * 1024 * 1024)
    throw new Error("Files must be nonempty and no larger than 10 MB");
  return extension;
}
export interface PerformanceEntry {
  homeworkId: string;
  attempt: number;
  releasedAt: string | null;
  earned: number;
  possible: number;
  late: boolean;
}
export function aggregatePerformance<T extends PerformanceEntry>(entries: T[]) {
  const latest = new Map<string, T>();
  for (const e of entries)
    if (
      e.releasedAt &&
      (!latest.has(e.homeworkId) ||
        latest.get(e.homeworkId)!.attempt < e.attempt)
    )
      latest.set(e.homeworkId, e);
  const items = [...latest.values()].sort((a, b) =>
    a.releasedAt!.localeCompare(b.releasedAt!),
  );
  const earned = items.reduce((n, e) => n + e.earned, 0),
    possible = items.reduce((n, e) => n + e.possible, 0);
  return {
    items,
    count: items.length,
    earned,
    possible,
    percentage: possible ? Math.round((100 * earned) / possible) : null,
    onTime: items.filter((e) => !e.late).length,
  };
}
export interface Homework {
  id: string;
  owner_id: string;
  organization_id: string | null;
  lesson_id: string;
  publication_id: string;
  title: string;
  instructions: string;
  subject: string;
  grade_level: string;
  lesson_title: string;
  publication_version: number;
  objectives: { id: string; text: string; revision: number }[];
  questions: Question[];
  due_at: string;
  close_at: string | null;
  timezone: string;
  accept_late: boolean;
  allow_hints: boolean;
  allow_references: boolean;
  minutes: number;
  status: "draft" | "published" | "archived";
  version: number;
  created_at: string;
  published_at: string | null;
}
export interface Attempt {
  id: string;
  homework_id: string;
  student_id: string;
  attempt_number: number;
  version: number;
  answers: Answers;
  submitted_at: string | null;
  late: boolean;
  hint_count: number;
  revision_feedback: string | null;
  revision_due_at: string | null;
  created_at: string;
}
export interface Grade {
  attempt_id: string;
  marks: Marks;
  feedback: string;
  version: number;
  released_at: string | null;
  released_marks: Marks | null;
  released_feedback: string | null;
}
export function gradeNeedsRelease(grade: Grade) {
  return (
    !grade.released_at ||
    grade.feedback !== grade.released_feedback ||
    JSON.stringify(grade.marks) !== JSON.stringify(grade.released_marks)
  );
}
export interface Attachment {
  id: string;
  homework_id: string;
  student_id: string;
  attempt_id: string;
  question_id: string;
  filename: string;
  mime_type: string;
  byte_size: number;
  storage_path: string;
}
export interface Recipient {
  homework_id: string;
  student_id: string;
  extension_at: string | null;
  name: string;
}
export interface HomeworkDetail {
  homework: Homework;
  keys?: Keys;
  attempts: Attempt[];
  grades: Grade[];
  attachments: Attachment[];
  recipients: Recipient[];
  teacherName: string;
}
export function attemptIsEditable(
  h: Homework,
  a: Attempt,
  extension: string | null,
  now = Date.now(),
) {
  if (h.status !== "published" || a.submitted_at) return false;
  const due = a.revision_due_at ?? extension ?? h.due_at;
  const close = h.close_at
    ? Math.max(
        Date.parse(h.close_at),
        Date.parse(a.revision_due_at ?? extension ?? h.close_at),
      )
    : null;
  return (
    !(close !== null && now > close) &&
    !(!h.accept_late && now > Date.parse(due))
  );
}
export function studentGrade(grade: Grade): Grade | null {
  if (!grade.released_at || !grade.released_marks) return null;
  return {
    attempt_id: grade.attempt_id,
    marks: grade.released_marks,
    feedback: grade.released_feedback ?? "",
    version: grade.version,
    released_at: grade.released_at,
    released_marks: grade.released_marks,
    released_feedback: grade.released_feedback,
  };
}
