// Pure helpers that turn existing API responses into dashboard summaries.

export interface DashboardHomeworkItem {
  homework: {
    id: string;
    title: string;
    subject: string;
    lesson_title: string;
    status: string;
    due_at: string;
    close_at: string | null;
    accept_late: boolean;
    timezone: string;
  };
  assigned: number;
  submitted: number;
  marked?: number;
  released: number;
  myAttempt?: {
    submitted_at: string | null;
    revision_feedback: string | null;
    revision_due_at: string | null;
  } | null;
  extensionAt?: string | null;
  releasedAt: string | null;
}

export type StudentHomeworkState =
  | "not_started"
  | "in_progress"
  | "revision_requested";

export interface StudentHomeworkTask {
  item: DashboardHomeworkItem;
  dueAt: string;
  state: StudentHomeworkState;
  overdue: boolean;
}

export function studentDueAt(item: DashboardHomeworkItem) {
  return (
    item.myAttempt?.revision_due_at ??
    item.extensionAt ??
    item.homework.due_at
  );
}

/** Homework the student still has to work on, soonest deadline first. */
export function studentHomeworkTasks(
  items: DashboardHomeworkItem[],
  now: Date,
): StudentHomeworkTask[] {
  return items
    .filter(
      (i) => i.homework.status === "published" && !i.myAttempt?.submitted_at,
    )
    .filter((i) => canStillSubmit(i, now))
    .map((item) => {
      const dueAt = studentDueAt(item);
      const state: StudentHomeworkState = item.myAttempt?.revision_feedback
        ? "revision_requested"
        : item.myAttempt
          ? "in_progress"
          : "not_started";
      return {
        item,
        dueAt,
        state,
        overdue: new Date(dueAt).getTime() < now.getTime(),
      };
    })
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

/** Same rule as attemptIsEditable in lib/homework/domain, for items that may have no attempt yet. */
export function canStillSubmit(item: DashboardHomeworkItem, now: Date) {
  const h = item.homework,
    personal = item.myAttempt?.revision_due_at ?? item.extensionAt ?? null,
    due = Date.parse(personal ?? h.due_at),
    close = h.close_at
      ? Math.max(Date.parse(h.close_at), Date.parse(personal ?? h.close_at))
      : null,
    t = now.getTime();
  return !(close !== null && t > close) && !(!h.accept_late && t > due);
}

export function studentFeedbackReady(items: DashboardHomeworkItem[]) {
  return items.filter((i) => i.releasedAt).length;
}

export interface TeacherHomeworkSummary {
  needMarking: number;
  readyToRelease: number;
  open: number;
  drafts: number;
  /** Published homework with work waiting, most waiting first. */
  attention: {
    item: DashboardHomeworkItem;
    needMarking: number;
    readyToRelease: number;
  }[];
}

export function teacherHomeworkSummary(
  items: DashboardHomeworkItem[],
): TeacherHomeworkSummary {
  const rows = items
    .filter((i) => i.homework.status !== "draft")
    .map((item) => {
      const marked = item.marked ?? 0;
      return {
        item,
        needMarking: Math.max(0, item.submitted - marked),
        readyToRelease: Math.max(0, marked - item.released),
      };
    });
  return {
    needMarking: rows.reduce((n, r) => n + r.needMarking, 0),
    readyToRelease: rows.reduce((n, r) => n + r.readyToRelease, 0),
    open: items.filter((i) => i.homework.status === "published").length,
    drafts: items.filter((i) => i.homework.status === "draft").length,
    attention: rows
      .filter((r) => r.needMarking > 0 || r.readyToRelease > 0)
      .sort(
        (a, b) =>
          b.needMarking + b.readyToRelease - (a.needMarking + a.readyToRelease),
      ),
  };
}

export interface DashboardLiveClass {
  id: string;
  title: string;
  scheduled_start_at: string;
  scheduled_end_at: string;
  status: string;
  organizer_id?: string;
  lessons?: { title?: string } | { title?: string }[] | null;
}

/** Classes that have not finished yet, soonest first. */
export function upcomingLiveClasses<T extends DashboardLiveClass>(
  items: T[],
  now: Date,
  options: { organizerId?: string } = {},
): T[] {
  return items
    .filter((e) => e.status !== "cancelled" && e.status !== "ended")
    .filter((e) => e.status !== "draft")
    .filter((e) => new Date(e.scheduled_end_at).getTime() > now.getTime())
    .filter(
      (e) => !options.organizerId || e.organizer_id === options.organizerId,
    )
    .sort((a, b) => a.scheduled_start_at.localeCompare(b.scheduled_start_at));
}

export function liveClassLessonTitle(
  lessons: DashboardLiveClass["lessons"],
): string | null {
  if (!lessons) return null;
  if (Array.isArray(lessons)) return lessons[0]?.title ?? null;
  return lessons.title ?? null;
}

/** "Today, 14:30", "Tomorrow, 09:00" or "Mon 3 Nov, 09:00" in the viewer's time zone. */
export function formatWhen(value: string, now: Date) {
  const date = new Date(value);
  const time = date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  const dayDiff = Math.round(
    (startOfDay(date).getTime() - startOfDay(now).getTime()) / 86_400_000,
  );
  if (dayDiff === 0) return `Today, ${time}`;
  if (dayDiff === 1) return `Tomorrow, ${time}`;
  if (dayDiff === -1) return `Yesterday, ${time}`;
  return `${date.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  })}, ${time}`;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
