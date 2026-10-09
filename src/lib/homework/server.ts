import "server-only";
import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { getServerSession } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase.server";
import { LessonArtifactHttpError } from "@/lib/lesson-artifacts/server";
import { readAll } from "./read-all";
import {
  studentGrade,
  type Homework,
  type HomeworkDetail,
  type Attempt,
  type Grade,
} from "./domain";

export class HomeworkError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export type HomeworkUser = { id: string; role: string };
export async function requireHomeworkUser(teacher = false) {
  const session = await getServerSession();
  if (!session?.user.id)
    throw new HomeworkError(401, "Sign in to access homework");
  const role = session.user.role ?? "";
  if (
    !["teacher", "student", "admin"].includes(role) ||
    (teacher && !["teacher", "admin"].includes(role))
  )
    throw new HomeworkError(403, "Teacher access required");
  return { user: { id: session.user.id, role }, db: createServerSupabase() };
}
export type HomeworkDB = ReturnType<typeof createServerSupabase>;
export async function activeMembership(
  db: HomeworkDB,
  userId: string,
  organizationId: string | null,
) {
  if (!organizationId) return false;
  const { data, error } = await db
    .from("organization_members")
    .select("organization_id")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}
export async function requireHomework(id: string) {
  z.string().uuid().parse(id);
  const context = await requireHomeworkUser();
  const { data, error } = await context.db
    .from("homeworks")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  const homework = data as Homework | null;
  if (!homework) throw new HomeworkError(404, "Homework not found");
  if (context.user.role === "student") {
    const { data: recipient, error: recipientError } = await context.db
      .from("homework_recipients")
      .select("student_id")
      .eq("homework_id", id)
      .eq("student_id", context.user.id)
      .maybeSingle();
    if (recipientError) throw recipientError;
    if (
      !recipient ||
      homework.status === "draft" ||
      !(await activeMembership(
        context.db,
        context.user.id,
        homework.organization_id,
      ))
    )
      throw new HomeworkError(403, "This homework is not assigned to you");
  } else {
    if (homework.owner_id !== context.user.id)
      throw new HomeworkError(403, "You cannot manage this homework");
    if (
      (homework.status === "published" || Boolean(homework.published_at)) &&
      !(await activeMembership(
        context.db,
        context.user.id,
        homework.organization_id,
      ))
    )
      throw new HomeworkError(403, "Active school membership is required");
  }
  return { ...context, homework };
}
export async function mutate(
  db: HomeworkDB,
  userId: string,
  homeworkId: string | null,
  action: string,
  payload: unknown = {},
) {
  const { data, error } = await db.rpc("homework_mutate", {
    p_actor: userId,
    p_homework: homeworkId,
    p_action: action,
    p_payload: payload,
  });
  if (error) throw error;
  return data;
}
export async function homeworkDetail(
  id: string,
  studentId?: string,
): Promise<HomeworkDetail> {
  const { user, db, homework } = await requireHomework(id),
    student = user.role === "student";
  const target = student ? user.id : studentId;
  if (target) z.string().uuid().parse(target);
  let attemptsQuery = db
    .from("homework_attempts")
    .select(
      target
        ? "*"
        : "id,homework_id,student_id,attempt_number,version,submitted_at,late,hint_count,revision_feedback,revision_due_at,created_at",
    )
    .eq("homework_id", id)
    .order("attempt_number", { ascending: false })
    .order("id");
  if (target) attemptsQuery = attemptsQuery.eq("student_id", target);
  const attemptRows = await readAll(
    (from, to) => attemptsQuery.range(from, to),
    5000,
  );
  const attempts: Attempt[] = (attemptRows ?? []).map((row) => {
    const a = row as unknown as Record<string, unknown>;
    return { ...a, answers: a.answers ?? {} } as unknown as Attempt;
  });
  let gradeQuery = db
    .from("homework_grades")
    .select("*,homework_attempts!inner(homework_id,student_id)")
    .eq("homework_attempts.homework_id", id)
    .order("attempt_id");
  if (target)
    gradeQuery = gradeQuery.eq("homework_attempts.student_id", target);
  const [gradeResult, attachmentResult, recipientResult, teacherResult] =
    await Promise.all([
      readAll((from, to) => gradeQuery.range(from, to), 5000).then((data) => ({
        data,
        error: null,
      })),
      target
        ? readAll(
            (from, to) =>
              db
                .from("homework_attachments")
                .select("*")
                .eq("homework_id", id)
                .eq("student_id", target)
                .order("id")
                .range(from, to),
            5000,
          ).then((data) => ({ data, error: null }))
        : Promise.resolve({ data: [], error: null }),
      student
        ? db
            .from("homework_recipients")
            .select("*")
            .eq("homework_id", id)
            .eq("student_id", user.id)
        : db
            .from("homework_recipients")
            .select("*")
            .eq("homework_id", id)
            .limit(200),
      db.from("users").select("name").eq("id", homework.owner_id).maybeSingle(),
    ]);
  for (const result of [
    gradeResult,
    attachmentResult,
    recipientResult,
    teacherResult,
  ])
    if (result.error) throw result.error;
  const recipients = recipientResult.data ?? [];
  const names = recipients.length
    ? await db
        .from("users")
        .select("id,name")
        .in(
          "id",
          recipients.map((r) => r.student_id),
        )
    : { data: [], error: null };
  if (names.error) throw names.error;
  const grades = gradeResult.data as Grade[];
  const result: HomeworkDetail = {
    homework,
    attempts,
    grades: student
      ? grades.map(studentGrade).filter((g): g is Grade => g !== null)
      : grades,
    attachments: attachmentResult.data ?? [],
    recipients: recipients.map((r) => ({
      ...r,
      name: names.data?.find((n) => n.id === r.student_id)?.name ?? "Student",
    })),
    teacherName: teacherResult.data?.name ?? "Teacher",
  };
  if (!student) {
    const { data, error } = await db
      .from("homework_keys")
      .select("keys")
      .eq("homework_id", id)
      .single();
    if (error) throw error;
    result.keys = data.keys;
  }
  return result;
}
const DB_MESSAGES: Record<string, [number, string]> = {
  "Homework history exceeds the report limit": [
    413,
    "This report exceeds the current history limit. Contact your school administrator.",
  ],
  FORBIDDEN: [403, "You do not have access to this homework"],
  NOT_FOUND: [404, "Homework or submission not found"],
  DRAFT_CONFLICT: [
    409,
    "A newer version was saved. Reload it before overwriting your changes.",
  ],
  PUBLISHED_IMMUTABLE: [
    409,
    "Published questions are locked. Duplicate the homework to change them.",
  ],
  FUTURE_DEADLINE_REQUIRED: [400, "Choose a future deadline"],
  RECIPIENTS_REQUIRED: [400, "Select 1–200 eligible students"],
  SCHOOL_MEMBERSHIP_REQUIRED: [
    403,
    "Assign this lesson to a school and ensure you are an active member first",
  ],
  INELIGIBLE_RECIPIENT: [
    403,
    "One or more selected students are outside your authorized school roster",
  ],
  HOMEWORK_CLOSED: [
    409,
    "This homework is closed. Your saved work remains available.",
  ],
  ATTEMPT_IMMUTABLE: [409, "This submitted attempt is read-only"],
  INVALID_ANSWERS: [400, "Check the answers and question IDs"],
  INVALID_CHOICE: [400, "Choose an available answer"],
  REQUIRED_ANSWER: [400, "Complete every required response before submitting"],
  INVALID_ATTACHMENT: [
    400,
    "The attachment is not available for this question",
  ],
  ATTACHMENT_LIMIT: [400, "Use no more than 3 files per question"],
  HINTS_DISABLED: [403, "Your teacher has disabled hints for this homework"],
  INVALID_MARKS: [400, "Marks must stay within each question’s maximum"],
  INVALID_RUBRIC: [400, "Check the rubric scores and total"],
  INCOMPLETE_MARKING: [400, "Mark every question before releasing feedback"],
  REVISION_FEEDBACK_REQUIRED: [
    400,
    "Provide revision feedback and a future deadline",
  ],
  REVISION_ALREADY_EXISTS: [409, "A newer attempt already exists"],
};
export function homeworkError(error: unknown) {
  if (
    error instanceof HomeworkError ||
    error instanceof LessonArtifactHttpError
  )
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  if (error instanceof ZodError)
    return NextResponse.json(
      { error: error.issues.map((i) => i.message).join("; ") },
      { status: 400 },
    );
  if (error instanceof SyntaxError)
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  const message =
    typeof error === "object" && error && "message" in error
      ? String(error.message)
      : "";
  for (const [code, [status, text]] of Object.entries(DB_MESSAGES))
    if (message.includes(code))
      return NextResponse.json({ error: text }, { status });
  console.error(
    "Homework request failed",
    typeof error === "object" && error && "code" in error
      ? error.code
      : "unknown",
  );
  return NextResponse.json(
    { error: "Homework could not be loaded or saved. Please retry." },
    { status: 500 },
  );
}
export async function requestBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new HomeworkError(400, "Request body required");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 2_000_000) {
      await reader.cancel();
      throw new HomeworkError(413, "This homework request is too large");
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
