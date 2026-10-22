import "server-only";
import { createServerSupabase } from "@/lib/supabase.server";
import { attemptLocksGeneralAi, type Homework, type Attempt } from "./domain";

/** The homework that currently pauses a student's general AI tools, if any. */
export async function editableHomeworkForUser(userId: string) {
  const db = createServerSupabase();
  const { data, error } = await db
    .from("homework_attempts")
    .select(
      "homework_id,submitted_at,revision_due_at,homework_recipients!inner(homeworks!inner(id,title,organization_id,status,due_at,close_at,accept_late))",
    )
    .eq("student_id", userId)
    .is("submitted_at", null)
    .eq("homework_recipients.homeworks.status", "published");
  if (error) throw error;
  const { data: members, error: memberError } = await db
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .eq("is_active", true);
  if (memberError) throw memberError;
  const organizations = new Set(members?.map((m) => m.organization_id));
  if (!data?.length) return null;
  const { data: recipients, error: recipientError } = await db
    .from("homework_recipients")
    .select("homework_id,extension_at")
    .eq("student_id", userId)
    .in(
      "homework_id",
      data.map((a) => a.homework_id),
    );
  if (recipientError) throw recipientError;
  return (
    data.find((row) => {
      const a = row as unknown as Attempt & {
        homework_recipients: { homeworks: Homework };
      };
      const homework = a.homework_recipients.homeworks;
      return (
        organizations.has(homework.organization_id) &&
        attemptLocksGeneralAi(
          homework,
          a,
          recipients?.find((r) => r.homework_id === a.homework_id)
            ?.extension_at ?? null,
        )
      );
    }) ?? null
  );
}

export interface HomeworkAiLock {
  homeworkId: string;
  title: string;
  dueAt: string;
}

/** A small, student-facing summary of the homework that pauses AI tools. */
export async function homeworkAiLockForUser(userId: string): Promise<HomeworkAiLock | null> {
  const row = await editableHomeworkForUser(userId);
  if (!row) return null;
  const a = row as unknown as Attempt & { homework_recipients: { homeworks: Homework } };
  const homework = a.homework_recipients.homeworks;
  return {
    homeworkId: a.homework_id,
    title: homework.title ?? "your homework",
    dueAt: a.revision_due_at ?? homework.due_at,
  };
}

export function homeworkAiLockMessage(lock: HomeworkAiLock) {
  return `AI tools are paused while "${lock.title}" is open. Finish and submit it, or use the help controls inside the homework. They come back once it's submitted or due.`;
}
