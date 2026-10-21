import { describe, expect, it } from "vitest";
import {
  draftsToReview,
  lessonProgress,
  mergeActivity,
  studentsFallingBehind,
  weakestObjectives,
  type InsightAttempt,
  type InsightGrade,
  type InsightHomework,
} from "../dashboard-insights";

const now = new Date("2026-10-21T12:00:00Z");

const hw = (over: Partial<InsightHomework> = {}): InsightHomework => ({
  id: "h1",
  title: "Fractions",
  due_at: "2026-10-20T12:00:00Z",
  close_at: null,
  objectives: [
    { id: "o1", text: "Add fractions" },
    { id: "o2", text: "Simplify fractions" },
  ],
  questions: [
    { id: "q1", points: 4, objectiveId: "o1" },
    { id: "q2", points: 6, objectiveId: "o2" },
  ],
  ...over,
});

const attempt = (over: Partial<InsightAttempt>): InsightAttempt => ({
  id: "a1",
  homework_id: "h1",
  student_id: "s1",
  attempt_number: 1,
  submitted_at: "2026-10-19T12:00:00Z",
  late: false,
  revision_due_at: null,
  ...over,
});

const grade = (attemptId: string, q1: number, q2: number, released = true): InsightGrade => {
  const marks = { q1: { score: q1 }, q2: { score: q2 } };
  return {
    attempt_id: attemptId,
    marks,
    released_at: released ? "2026-10-20T00:00:00Z" : null,
    released_marks: released ? marks : null,
  };
};

describe("mergeActivity", () => {
  it("sorts newest first, drops bad dates and limits", () => {
    const out = mergeActivity(
      [
        [
          { kind: "tutor_session", at: "2026-10-01T00:00:00Z", title: "old" },
          { kind: "tutor_session", at: "not a date", title: "bad" },
        ],
        [
          { kind: "practice_completed", at: "2026-10-03T00:00:00Z", title: "new" },
          { kind: "homework_submitted", at: "2026-10-02T00:00:00Z", title: "mid" },
        ],
      ],
      2,
    );
    expect(out.map((i) => i.title)).toEqual(["new", "mid"]);
  });
});

describe("lessonProgress", () => {
  it("ignores mastered objectives that are no longer in the lesson", () => {
    expect(lessonProgress(["o1", "o2", "o3", "o4"], ["o1", "o1", "old"])).toEqual({
      mastered: 1,
      total: 4,
      percentage: 25,
    });
    expect(lessonProgress([], ["o1"]).percentage).toBeNull();
  });
});

describe("studentsFallingBehind", () => {
  it("flags overdue, late and low released scores", () => {
    const out = studentsFallingBehind({
      homeworks: [hw()],
      recipients: [
        { homework_id: "h1", student_id: "overdue", extension_at: null },
        { homework_id: "h1", student_id: "extended", extension_at: "2026-10-25T00:00:00Z" },
        { homework_id: "h1", student_id: "late-low", extension_at: null },
        { homework_id: "h1", student_id: "fine", extension_at: null },
        { homework_id: "h1", student_id: "revising", extension_at: null },
      ],
      attempts: [
        attempt({ id: "a-late", student_id: "late-low", late: true }),
        attempt({ id: "a-fine", student_id: "fine" }),
        attempt({ id: "r1", student_id: "revising" }),
        attempt({
          id: "r2",
          student_id: "revising",
          attempt_number: 2,
          submitted_at: null,
          revision_due_at: "2026-10-23T00:00:00Z",
        }),
      ],
      grades: [grade("a-late", 1, 2), grade("a-fine", 4, 6)],
      now,
    });
    expect(out).toEqual([
      expect.objectContaining({ studentId: "late-low", late: 1, lowScores: 1, missed: 0 }),
      expect.objectContaining({ studentId: "overdue", missed: 1 }),
    ]);
  });

  it("ignores unreleased marks for low scores", () => {
    const out = studentsFallingBehind({
      homeworks: [hw()],
      recipients: [{ homework_id: "h1", student_id: "s1", extension_at: null }],
      attempts: [attempt({})],
      grades: [grade("a1", 0, 0, false)],
      now,
    });
    expect(out).toEqual([]);
  });
});

describe("weakestObjectives", () => {
  it("averages fully marked latest submissions per objective, lowest first", () => {
    const out = weakestObjectives({
      homeworks: [hw()],
      attempts: [
        attempt({ id: "a1", student_id: "s1" }),
        attempt({ id: "a2", student_id: "s2" }),
        attempt({ id: "a3", student_id: "s3" }),
      ],
      grades: [
        grade("a1", 4, 3, false),
        grade("a2", 2, 3),
        // Partly marked: left out.
        { attempt_id: "a3", marks: { q1: { score: 0 } }, released_at: null, released_marks: null },
      ],
    });
    expect(out).toEqual([
      expect.objectContaining({ objectiveId: "o2", percentage: 50, submissions: 2 }),
      expect.objectContaining({ objectiveId: "o1", percentage: 75, submissions: 2 }),
    ]);
  });
});

describe("draftsToReview", () => {
  it("counts only the latest version of each series, on live objectives", () => {
    const counts = draftsToReview(
      [
        // Regenerated: v1 draft is superseded by the v2 draft.
        { lesson_id: "l1", objective_id: "o1", series_id: "s1", version: 1, status: "draft" },
        { lesson_id: "l1", objective_id: "o1", series_id: "s1", version: 2, status: "draft" },
        // Latest version approved: nothing to review.
        { lesson_id: "l1", objective_id: "o1", series_id: "s2", version: 1, status: "draft" },
        { lesson_id: "l1", objective_id: "o1", series_id: "s2", version: 2, status: "approved" },
        // Archived objective: ignored.
        { lesson_id: "l1", objective_id: "gone", series_id: "s3", version: 1, status: "draft" },
        { lesson_id: "l2", objective_id: "o2", series_id: "s4", version: 1, status: "draft" },
      ],
      new Set(["o1", "o2"]),
    );
    expect(Object.fromEntries(counts)).toEqual({ l1: 1, l2: 1 });
  });
});
