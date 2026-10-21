// Pure aggregation for the dashboard endpoints (/api/dashboard/student and
// /api/dashboard/teacher). Kept free of database code so it can be unit tested.

export type ActivityKind =
  | "feedback_released"
  | "homework_submitted"
  | "objective_mastered"
  | "practice_completed"
  | "tutor_session";

export interface ActivityItem {
  kind: ActivityKind;
  at: string;
  title: string;
  detail?: string;
  href?: string;
}

/** Newest first, at most `limit` items, ignoring items without a time. */
export function mergeActivity(lists: ActivityItem[][], limit = 8) {
  return lists
    .flat()
    .filter((i) => i.at && !Number.isNaN(Date.parse(i.at)))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, limit);
}

export interface LessonProgress {
  mastered: number;
  total: number;
  percentage: number | null;
}

/** Objectives mastered in a lesson, counting only objectives that still exist. */
export function lessonProgress(
  objectiveIds: string[],
  masteredObjectiveIds: Iterable<string>,
): LessonProgress {
  const current = new Set(objectiveIds),
    mastered = new Set([...masteredObjectiveIds].filter((id) => current.has(id)));
  return {
    mastered: mastered.size,
    total: current.size,
    percentage: current.size
      ? Math.round((100 * mastered.size) / current.size)
      : null,
  };
}

// ---------------------------------------------------------------------------
// Teacher insights from homework

export interface InsightQuestion {
  id: string;
  points: number;
  objectiveId?: string | null;
}

export interface InsightHomework {
  id: string;
  title: string;
  due_at: string;
  close_at: string | null;
  questions: InsightQuestion[];
  objectives: { id: string; text: string }[];
}

export interface InsightRecipient {
  homework_id: string;
  student_id: string;
  extension_at: string | null;
}

export interface InsightAttempt {
  id: string;
  homework_id: string;
  student_id: string;
  attempt_number: number;
  submitted_at: string | null;
  late: boolean;
  revision_due_at?: string | null;
}

export interface InsightGrade {
  attempt_id: string;
  marks: Record<string, { score: number } | undefined>;
  released_at: string | null;
  released_marks: Record<string, { score: number } | undefined> | null;
}

/** Latest attempt per (homework, student). */
export function latestAttempts(attempts: InsightAttempt[]) {
  const latest = new Map<string, InsightAttempt>();
  for (const a of attempts) {
    const key = `${a.homework_id}:${a.student_id}`,
      seen = latest.get(key);
    if (!seen || seen.attempt_number < a.attempt_number) latest.set(key, a);
  }
  return latest;
}

function fullyMarked(
  questions: InsightQuestion[],
  marks: InsightGrade["marks"] | null | undefined,
) {
  return (
    Boolean(marks) &&
    questions.every((q) => typeof marks?.[q.id]?.score === "number")
  );
}

function scoreOf(
  questions: InsightQuestion[],
  marks: InsightGrade["marks"],
) {
  return questions.reduce((n, q) => n + (marks[q.id]?.score ?? 0), 0);
}

export const LOW_SCORE_PERCENT = 50;

export interface StudentConcern {
  studentId: string;
  missed: number;
  late: number;
  lowScores: number;
  /** Homework the concern list links to: the most recent one with an issue. */
  latestHomeworkId: string;
  latestHomeworkTitle: string;
}

/**
 * Students with overdue work, late hand-ins, or a released score below
 * LOW_SCORE_PERCENT. Overdue ("missed") means the due date, or the student's
 * extension, has passed with nothing submitted. Most concerns first.
 */
export function studentsFallingBehind(input: {
  homeworks: InsightHomework[];
  recipients: InsightRecipient[];
  attempts: InsightAttempt[];
  grades: InsightGrade[];
  now: Date;
}): StudentConcern[] {
  const byId = new Map(input.homeworks.map((h) => [h.id, h])),
    latest = latestAttempts(input.attempts),
    grades = new Map(input.grades.map((g) => [g.attempt_id, g])),
    concerns = new Map<string, StudentConcern & { latestDue: number }>();
  for (const r of input.recipients) {
    const h = byId.get(r.homework_id);
    if (!h) continue;
    const attempt = latest.get(`${r.homework_id}:${r.student_id}`),
      deadline = Date.parse(
        attempt?.revision_due_at ?? r.extension_at ?? h.due_at,
      );
    let missed = 0,
      late = 0,
      low = 0;
    if (!attempt?.submitted_at) {
      if (deadline < input.now.getTime()) missed = 1;
    } else {
      if (attempt.late) late = 1;
      const g = grades.get(attempt.id);
      const possible = h.questions.reduce((n, q) => n + q.points, 0);
      if (
        g?.released_at &&
        g.released_marks &&
        possible > 0 &&
        fullyMarked(h.questions, g.released_marks) &&
        (100 * scoreOf(h.questions, g.released_marks)) / possible <
          LOW_SCORE_PERCENT
      )
        low = 1;
    }
    if (!missed && !late && !low) continue;
    const c = concerns.get(r.student_id) ?? {
      studentId: r.student_id,
      missed: 0,
      late: 0,
      lowScores: 0,
      latestHomeworkId: h.id,
      latestHomeworkTitle: h.title,
      latestDue: -Infinity,
    };
    c.missed += missed;
    c.late += late;
    c.lowScores += low;
    const due = Date.parse(h.due_at);
    if (due > c.latestDue) {
      c.latestDue = due;
      c.latestHomeworkId = h.id;
      c.latestHomeworkTitle = h.title;
    }
    concerns.set(r.student_id, c);
  }
  return [...concerns.values()]
    .sort(
      (a, b) =>
        b.missed + b.late + b.lowScores - (a.missed + a.late + a.lowScores) ||
        b.missed - a.missed ||
        b.latestDue - a.latestDue,
    )
    .map(({ latestDue: _latestDue, ...c }) => c);
}

export interface ObjectiveScore {
  homeworkId: string;
  homeworkTitle: string;
  objectiveId: string;
  objectiveText: string;
  percentage: number;
  submissions: number;
}

/**
 * Average score per homework objective over fully marked latest submissions
 * (the teacher's marks, released or not, like the homework Insights page).
 * Lowest first.
 */
export function weakestObjectives(input: {
  homeworks: InsightHomework[];
  attempts: InsightAttempt[];
  grades: InsightGrade[];
}): ObjectiveScore[] {
  const latest = latestAttempts(input.attempts),
    grades = new Map(input.grades.map((g) => [g.attempt_id, g])),
    rows: ObjectiveScore[] = [];
  for (const h of input.homeworks) {
    const marked = [...latest.values()]
      .filter((a) => a.homework_id === h.id && a.submitted_at)
      .map((a) => grades.get(a.id)?.marks)
      .filter((m): m is InsightGrade["marks"] => fullyMarked(h.questions, m));
    if (!marked.length) continue;
    for (const o of h.objectives) {
      const qs = h.questions.filter((q) => q.objectiveId === o.id),
        max = qs.reduce((n, q) => n + q.points, 0) * marked.length;
      if (!max) continue;
      const got = marked.reduce((n, m) => n + scoreOf(qs, m), 0);
      rows.push({
        homeworkId: h.id,
        homeworkTitle: h.title,
        objectiveId: o.id,
        objectiveText: o.text,
        percentage: Math.round((100 * got) / max),
        submissions: marked.length,
      });
    }
  }
  return rows.sort(
    (a, b) => a.percentage - b.percentage || b.submissions - a.submissions,
  );
}
