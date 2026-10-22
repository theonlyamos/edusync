import { describe, expect, it } from "vitest";
import { markingQueue, nextStudentToMark, type HomeworkDetail } from "../domain";

const questions = [
  { id: "q1", type: "short_answer", prompt: "A", objectiveId: "o", points: 1, required: true, options: [], rubric: [] },
  { id: "q2", type: "short_answer", prompt: "B", objectiveId: "o", points: 1, required: true, options: [], rubric: [] },
];
const recipients = ["ama", "esi", "kofi", "yaw"].map((student_id) => ({
  homework_id: "h",
  student_id,
  extension_at: null,
  name: student_id,
}));
const attempt = (id: string, student_id: string, submitted: boolean, attempt_number = 1) => ({
  id,
  student_id,
  attempt_number,
  submitted_at: submitted ? "2026-10-22T10:00:00Z" : null,
});
const grade = (attempt_id: string, marked: string[]) => ({
  attempt_id,
  marks: Object.fromEntries(marked.map((q) => [q, { score: 1, feedback: "" }])),
});

function detail(attempts: unknown[], grades: unknown[]) {
  return { homework: { questions }, recipients, attempts, grades } as unknown as HomeworkDetail;
}

describe("marking queue", () => {
  // ama submitted and fully marked, esi submitted with one mark, kofi started only, yaw submitted with none.
  const d = detail(
    [attempt("a1", "ama", true), attempt("e1", "esi", true), attempt("k1", "kofi", false), attempt("y1", "yaw", true)],
    [grade("a1", ["q1", "q2"]), grade("e1", ["q1"])],
  );

  it("lists submitted students and those still needing marks, in class order", () => {
    expect(markingQueue(d)).toEqual({ submitted: ["ama", "esi", "yaw"], needsMarking: ["esi", "yaw"] });
  });

  it("skips students who have not submitted", () => {
    expect(nextStudentToMark(d, "esi")).toBe("yaw");
  });

  it("wraps round to earlier students", () => {
    expect(nextStudentToMark(d, "yaw")).toBe("esi");
  });

  it("starts from anyone when no student is selected", () => {
    expect(nextStudentToMark(d, "")).toBe("esi");
  });

  it("returns null when no one else needs marks", () => {
    const done = detail([attempt("e1", "esi", true)], [grade("e1", ["q1"])]);
    expect(nextStudentToMark(done, "esi")).toBeNull();
  });

  it("uses the latest attempt, so a revision request puts a student back in the queue", () => {
    const revised = detail(
      [attempt("a2", "ama", true, 2), attempt("a1", "ama", true, 1)],
      [grade("a1", ["q1", "q2"])],
    );
    expect(markingQueue(revised).needsMarking).toEqual(["ama"]);
  });
});
