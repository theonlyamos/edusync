import { describe, expect, it } from "vitest";
import { questionInsights, scoreBands, plural } from "../insights";
import type { Question } from "../domain";

const objectiveId = "11111111-1111-4111-8111-111111111111";
const questions: Question[] = [
  { id: "q1", type: "multiple_choice", prompt: "2 + 2?", objectiveId, points: 2, required: true, options: ["3", "4", "5"], rubric: [] },
  { id: "q2", type: "written", prompt: "Explain", objectiveId, points: 4, required: true, options: [], rubric: [] },
];
const submissions = [
  { studentId: "a", name: "Yaw", answers: { q1: "5", q2: "x" }, marks: { q1: { score: 0, feedback: "" }, q2: { score: 1, feedback: "" } } },
  { studentId: "b", name: "Ama", answers: { q1: "4", q2: "y" }, marks: { q1: { score: 2, feedback: "" }, q2: { score: 4, feedback: "" } } },
  { studentId: "c", name: "Esi", answers: { q1: "5", q2: "z" }, marks: { q1: { score: 0, feedback: "" }, q2: { score: 3, feedback: "" } } },
];

describe("homework insights", () => {
  it("summarises each question", () => {
    const [q1, q2] = questionInsights(questions, submissions);
    expect(q1).toMatchObject({ number: 1, percent: 33, fullMarks: 1, commonWrongAnswer: { answer: "5", count: 2 } });
    expect(q2).toMatchObject({ number: 2, percent: 67, fullMarks: 1, commonWrongAnswer: null });
  });

  it("puts students in score bands", () => {
    const bands = scoreBands(questions, submissions);
    expect(bands[0]).toEqual([{ name: "Yaw", percent: 17 }]);
    expect(bands[1]).toEqual([{ name: "Esi", percent: 50 }]);
    expect(bands[3]).toEqual([{ name: "Ama", percent: 100 }]);
  });

  it("handles no submissions and plurals", () => {
    expect(questionInsights(questions, [])[0].percent).toBe(0);
    expect(plural(1, "student")).toBe("1 student");
    expect(plural(3, "student")).toBe("3 students");
  });
});
