// A teacher's view of their students, built from homework the teacher set.
// Pure functions so the rules can be tested without a database.

import {
  latestAttempts,
  type InsightAttempt,
  type InsightGrade,
  type InsightHomework,
  type InsightRecipient,
} from "@/lib/dashboard-insights";

export interface RosterStudent {
  id: string;
  name: string;
  grade: string | null;
}

export interface RosterRow extends RosterStudent {
  assigned: number;
  submitted: number;
  late: number;
  /** Past the deadline with nothing handed in. */
  missed: number;
  /** Average of released scores, 0-100, or null when nothing is released yet. */
  averageScore: number | null;
  lastActive: string | null;
}

export type HomeworkState = "released" | "marking" | "submitted" | "missed" | "open";

export interface StudentHomeworkRow {
  homeworkId: string;
  title: string;
  dueAt: string;
  state: HomeworkState;
  late: boolean;
  submittedAt: string | null;
  /** Released score, 0-100. */
  score: number | null;
}

export interface StudentObjectiveRow {
  objectiveId: string;
  text: string;
  homeworkTitle: string;
  percentage: number;
}

type Marks = InsightGrade["marks"];

function possible(h: InsightHomework) {
  return h.questions.reduce((n, q) => n + q.points, 0);
}

function fullyMarked(h: InsightHomework, marks: Marks | null | undefined): marks is Marks {
  return Boolean(marks) && h.questions.every((q) => typeof marks?.[q.id]?.score === "number");
}

function percent(h: InsightHomework, marks: Marks) {
  const max = possible(h);
  return max ? Math.round((100 * h.questions.reduce((n, q) => n + (marks[q.id]?.score ?? 0), 0)) / max) : 0;
}

function deadline(h: InsightHomework, r: InsightRecipient, a?: InsightAttempt) {
  return Date.parse(a?.revision_due_at ?? r.extension_at ?? h.due_at);
}

/** One row per student's homework, newest due first. */
export function studentHomework(input: {
  studentId: string;
  homeworks: InsightHomework[];
  recipients: InsightRecipient[];
  attempts: InsightAttempt[];
  grades: InsightGrade[];
  now: Date;
}): StudentHomeworkRow[] {
  const byId = new Map(input.homeworks.map((h) => [h.id, h])),
    latest = latestAttempts(input.attempts.filter((a) => a.student_id === input.studentId)),
    grades = new Map(input.grades.map((g) => [g.attempt_id, g])),
    rows: StudentHomeworkRow[] = [];
  for (const r of input.recipients) {
    if (r.student_id !== input.studentId) continue;
    const h = byId.get(r.homework_id);
    if (!h) continue;
    const a = latest.get(`${h.id}:${input.studentId}`),
      g = a ? grades.get(a.id) : undefined;
    let state: HomeworkState, score: number | null = null;
    if (a?.submitted_at) {
      if (g?.released_at && fullyMarked(h, g.released_marks)) {
        state = "released";
        score = percent(h, g.released_marks);
      } else state = g ? "marking" : "submitted";
    } else state = deadline(h, r, a) < input.now.getTime() ? "missed" : "open";
    rows.push({
      homeworkId: h.id,
      title: h.title,
      dueAt: h.due_at,
      state,
      late: Boolean(a?.submitted_at && a.late),
      submittedAt: a?.submitted_at ?? null,
      score,
    });
  }
  return rows.sort((x, y) => y.dueAt.localeCompare(x.dueAt));
}

export function rosterRows(input: {
  students: RosterStudent[];
  homeworks: InsightHomework[];
  recipients: InsightRecipient[];
  attempts: InsightAttempt[];
  grades: InsightGrade[];
  lastActive: Map<string, string>;
  now: Date;
}): RosterRow[] {
  return input.students
    .map((s) => {
      const rows = studentHomework({ ...input, studentId: s.id });
      const scores = rows.map((r) => r.score).filter((n): n is number => n !== null);
      return {
        ...s,
        assigned: rows.length,
        submitted: rows.filter((r) => r.submittedAt).length,
        late: rows.filter((r) => r.late).length,
        missed: rows.filter((r) => r.state === "missed").length,
        averageScore: scores.length ? Math.round(scores.reduce((n, v) => n + v, 0) / scores.length) : null,
        lastActive: input.lastActive.get(s.id) ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The student's score per homework objective, from the teacher's marks. Lowest first. */
export function studentObjectives(input: {
  studentId: string;
  homeworks: InsightHomework[];
  attempts: InsightAttempt[];
  grades: InsightGrade[];
}): StudentObjectiveRow[] {
  const latest = latestAttempts(input.attempts.filter((a) => a.student_id === input.studentId)),
    grades = new Map(input.grades.map((g) => [g.attempt_id, g])),
    rows: StudentObjectiveRow[] = [];
  for (const h of input.homeworks) {
    const a = latest.get(`${h.id}:${input.studentId}`);
    const marks = a?.submitted_at ? grades.get(a.id)?.marks : undefined;
    if (!fullyMarked(h, marks)) continue;
    for (const o of h.objectives) {
      const qs = h.questions.filter((q) => q.objectiveId === o.id),
        max = qs.reduce((n, q) => n + q.points, 0);
      if (!max) continue;
      rows.push({
        objectiveId: o.id,
        text: o.text,
        homeworkTitle: h.title,
        percentage: Math.round((100 * qs.reduce((n, q) => n + (marks[q.id]?.score ?? 0), 0)) / max),
      });
    }
  }
  return rows.sort((a, b) => a.percentage - b.percentage);
}

/** Latest timestamp per student from any of the given lists. */
export function latestActivity(rows: { student_id: string; at: string | null }[]) {
  const map = new Map<string, string>();
  for (const r of rows) {
    if (!r.at) continue;
    const seen = map.get(r.student_id);
    if (!seen || r.at > seen) map.set(r.student_id, r.at);
  }
  return map;
}
