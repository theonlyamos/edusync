import { describe, it, expect } from "vitest";
import { gradeNeedsRelease, studentGrade, validateAnswers } from "../domain";
describe("homework visibility and attachment validation", () => {
  it("shows only the released snapshot while the teacher edits another grading draft", () => {
    const visible = studentGrade({
      attempt_id: "a",
      version: 2,
      marks: { q: { score: 0, feedback: "Private draft" } },
      feedback: "Private",
      released_at: "2026-10-10",
      released_marks: { q: { score: 2, feedback: "Released" } },
      released_feedback: "Public feedback",
    });
    expect(visible?.marks.q.score).toBe(2);
    expect(JSON.stringify(visible)).not.toContain("Private");
    expect(gradeNeedsRelease(visible!)).toBe(false);
    expect(
      gradeNeedsRelease({ ...visible!, feedback: "Private correction" }),
    ).toBe(true);
    expect(
      gradeNeedsRelease({
        ...visible!,
        marks: { q: { score: 1, feedback: "Changed" } },
      }),
    ).toBe(true);
    expect(gradeNeedsRelease({ ...visible!, released_at: null })).toBe(true);
  });
  it("does not accept repeated attachment IDs as separate uploaded responses", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const question = {
      id: "q",
      type: "file" as const,
      prompt: "Diagram",
      objectiveId: id,
      points: 4,
      required: true,
      options: [],
      rubric: [],
    };
    expect(() => validateAnswers([question], { q: [id, id] }, true)).toThrow(
      /distinct/i,
    );
  });
});
