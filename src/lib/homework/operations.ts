import "server-only";
import { z } from "zod";
import {
  draftSchema,
  splitQuestions,
  validateAnswers,
  validateMarks,
  provisionalMarks,
  type Homework,
  type Keys,
} from "./domain";
import {
  requireHomeworkUser,
  requireHomework,
  mutate,
  HomeworkError,
} from "./server";
import { sourceForHomework } from "./sources";
export async function saveHomework(input: unknown, id?: string) {
  const draft = draftSchema.parse(input),
    context = id ? await requireHomework(id) : await requireHomeworkUser(true);
  if (context.user.role === "student")
    throw new HomeworkError(403, "Teacher access required");
  const existing =
    "homework" in context ? (context.homework as Homework) : undefined;
  if (existing && draft.lessonId !== existing.lesson_id)
    throw new HomeworkError(400, "Duplicate homework to change its lesson");
  const source = await sourceForHomework(
    draft.lessonId,
    existing?.publication_id ?? draft.publicationId,
  );
  const objectives = source.objectives
    .filter((o) => draft.objectiveIds.includes(o.id))
    .map(({ id, text, revision }) => ({ id, text, revision }));
  if (objectives.length !== new Set(draft.objectiveIds).size)
    throw new HomeworkError(
      400,
      "Select objectives from the assigned lesson version",
    );
  const { questions, keys } = splitQuestions(draft.questions);
  const payload = {
    title: draft.title,
    instructions: draft.instructions,
    lesson_id: source.lessonId,
    organization_id: source.organizationId,
    publication_id: source.publicationId,
    publication_version: source.publicationVersion,
    subject: source.subject,
    grade_level: source.gradeLevel,
    lesson_title: source.title,
    objectives,
    questions,
    keys,
    due_at: draft.dueAt,
    close_at: draft.closeAt,
    timezone: draft.timezone,
    accept_late: draft.acceptLate,
    allow_hints: draft.allowHints,
    allow_references: draft.allowReferences,
    minutes: draft.minutes,
    version: id
      ? z.object({ version: z.number().int().positive() }).parse(input).version
      : undefined,
  };
  return mutate(
    context.db,
    context.user.id,
    id ?? null,
    id ? "save" : "create",
    payload,
  );
}
const attemptFields = {
  attemptId: z.string().uuid(),
  version: z.number().int().min(0),
};
export const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("publish"),
    version: z.number().int().positive(),
    recipients: z.array(z.string().uuid()).min(1).max(200),
  }),
  z.object({ action: z.literal("archive") }),
  z.object({ action: z.literal("start") }),
  z.object({
    action: z.literal("answers"),
    ...attemptFields,
    answers: z.unknown(),
  }),
  z.object({ action: z.literal("submit"), ...attemptFields }),
  z.object({
    action: z.literal("grade"),
    ...attemptFields,
    marks: z.unknown(),
    feedback: z.string().max(10000),
  }),
  z.object({ action: z.literal("release"), ...attemptFields }),
  z.object({ action: z.literal("release_all") }),
  z.object({
    action: z.literal("revise"),
    ...attemptFields,
    dueAt: z.string().datetime({ offset: true }),
    feedback: z.string().trim().min(1).max(10000),
  }),
  z.object({
    action: z.literal("extend"),
    studentId: z.string().uuid(),
    dueAt: z.string().datetime({ offset: true }),
    reason: z.string().max(1000).default(""),
  }),
]);
export async function homeworkAction(id: string, input: unknown) {
  const command = actionSchema.parse(input),
    { db, user, homework } = await requireHomework(id);
  const studentActions = ["start", "answers", "submit"];
  if (studentActions.includes(command.action) !== (user.role === "student"))
    throw new HomeworkError(403, "This action is not available for your role");
  const payload: Record<string, unknown> = { ...command };
  delete payload.action;
  if ("attemptId" in command) {
    let query = db
      .from("homework_attempts")
      .select("*")
      .eq("homework_id", id)
      .eq("id", command.attemptId);
    if (user.role === "student") query = query.eq("student_id", user.id);
    const { data: attempt, error } = await query.maybeSingle();
    if (error) throw error;
    if (!attempt) throw new HomeworkError(404, "Submission not found");
    try {
      if (command.action === "answers")
        payload.answers = validateAnswers(homework.questions, command.answers);
      if (command.action === "submit" && !attempt.submitted_at)
        validateAnswers(homework.questions, attempt.answers, true);
      if (command.action === "grade") {
        const marks = validateMarks(homework.questions, command.marks);
        const { data: keyRow, error: keyError } = await db
          .from("homework_keys")
          .select("keys")
          .eq("homework_id", id)
          .single();
        if (keyError) throw keyError;
        const provisional = provisionalMarks(
          homework.questions,
          keyRow.keys as Keys,
          attempt.answers,
        );
        for (const [qid, mark] of Object.entries(marks))
          if (
            provisional[qid] &&
            mark.score !== provisional[qid].score &&
            !mark.overrideReason?.trim()
          )
            throw new Error(
              "Explain overrides of automatically calculated choice marks",
            );
        payload.marks = marks;
      }
    } catch (error) {
      if (error instanceof Error) throw new HomeworkError(400, error.message);
      throw error;
    }
  }
  return mutate(db, user.id, id, command.action, payload);
}
