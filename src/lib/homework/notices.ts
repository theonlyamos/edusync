import "server-only";
import { notify, type NewNotification } from "@/lib/notifications.server";
import type { Homework } from "./domain";
import type { HomeworkDB } from "./server";

type Done = {
  db: HomeworkDB;
  homework: Homework;
  actorId: string;
  action: string;
  /** Students named by the action (publish). */
  recipients?: string[];
  /** The submission the action was about, as it was before the action. */
  attempt?: { student_id: string; submitted_at: string | null } | null;
  startedAt: Date;
};

/**
 * Tells the people on the other side of a homework action that it happened:
 * students when work is set, returned or sent back, the teacher when work
 * comes in. Never throws, so a notification can't undo the action.
 */
export async function sendHomeworkNotices(done: Done): Promise<void> {
  try {
    const { db, homework, action, attempt } = done;
    const title = homework.title;
    const studentHref = `/students/homework/${homework.id}`;
    const rows: NewNotification[] = [];
    if (action === "publish") {
      for (const userId of done.recipients ?? [])
        rows.push({ userId, kind: "homework_assigned", title: `New homework: ${title}`, href: studentHref });
    } else if (action === "submit" && attempt && !attempt.submitted_at) {
      rows.push({
        userId: homework.owner_id,
        kind: "homework_submitted",
        title: `Homework handed in: ${title}`,
        href: `/teachers/homework/${homework.id}/mark`,
      });
    } else if (action === "release" && attempt) {
      rows.push({ userId: attempt.student_id, kind: "homework_returned", title: `Marked: ${title}`, body: "Your marks and feedback are ready.", href: studentHref });
    } else if (action === "revise" && attempt) {
      rows.push({ userId: attempt.student_id, kind: "homework_returned", title: `Please revise: ${title}`, body: "Your teacher sent this back with feedback.", href: studentHref });
    } else if (action === "release_all") {
      const { data: attempts, error } = await db.from("homework_attempts").select("id, student_id").eq("homework_id", homework.id).limit(5000);
      if (error) throw error;
      const studentOf = new Map((attempts ?? []).map((row) => [row.id as string, row.student_id as string]));
      const ids = [...studentOf.keys()];
      // Only the marks this action released, not ones a student has already seen.
      const since = new Date(done.startedAt.getTime() - 5000).toISOString();
      for (let i = 0; i < ids.length; i += 100) {
        const { data: grades, error: gradeError } = await db.from("homework_grades").select("attempt_id").in("attempt_id", ids.slice(i, i + 100)).gte("released_at", since);
        if (gradeError) throw gradeError;
        for (const grade of grades ?? []) {
          const userId = studentOf.get(grade.attempt_id as string);
          if (userId) rows.push({ userId, kind: "homework_returned", title: `Marked: ${title}`, body: "Your marks and feedback are ready.", href: studentHref });
        }
      }
    }
    const others = rows.filter((row) => row.userId !== done.actorId);
    if (others.length) await notify(others, db);
  } catch (error) {
    console.error("[homework] notification failed:", error);
  }
}
