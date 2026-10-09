import { describe, expect, it } from "vitest";
import {
  questionSchema,
  splitQuestions,
  validateAnswers,
  provisionalMarks,
} from "../domain";

const multi = {
  id: "q",
  type: "multiple_select",
  prompt: "Which are forces?",
  objectiveId: "11111111-1111-4111-8111-111111111111",
  points: 4,
  required: true,
  options: ["Gravity", "Friction", "Speed"],
  correctAnswer: ["Gravity", "Friction"],
  guidance: "Private explanation",
  rubric: [],
};
describe("homework multiple-answer choices", () => {
  it("supports selecting all eight options independently of the three-file limit", () => {
    const options = ["A", "B", "C", "D", "E", "F", "G", "H"];
    const { questions, keys } = splitQuestions([
      { ...multi, options, correctAnswer: options },
    ]);
    const answers = validateAnswers(
      questions,
      { q: [...options].reverse() },
      true,
    );
    expect(provisionalMarks(questions, keys, answers).q.score).toBe(4);
    expect(() =>
      validateAnswers(questions, { q: [...options, "A"] }),
    ).toThrow();
  });
  it("accepts multiple correct options and keeps the key private", () => {
    expect(questionSchema.safeParse(multi).success).toBe(true);
    const { questions, keys } = splitQuestions([multi]);
    expect(questions[0].type).toBe("multiple_select");
    expect(JSON.stringify(questions)).not.toMatch(
      /correctAnswer|Private explanation/,
    );
    expect(keys.q.correctAnswer).toEqual(["Gravity", "Friction"]);
  });
  it("rejects empty, duplicate, foreign, or wrongly shaped keys", () => {
    for (const correctAnswer of [
      [],
      ["Gravity", "Gravity"],
      ["Unknown"],
      "Gravity",
    ])
      expect(
        questionSchema.safeParse({ ...multi, correctAnswer }).success,
      ).toBe(false);
    expect(
      questionSchema.safeParse({ ...multi, type: "multiple_choice" }).success,
    ).toBe(false);
  });
  it("accepts distinct selected options but rejects text, duplicates and foreign choices", () => {
    const { questions } = splitQuestions([multi]);
    expect(
      validateAnswers(questions, { q: ["Friction", "Gravity"] }, true),
    ).toEqual({ q: ["Friction", "Gravity"] });
    expect(validateAnswers(questions, { q: [] })).toEqual({ q: [] });
    for (const answer of ["Gravity", ["Gravity", "Gravity"], ["Unknown"]])
      expect(() => validateAnswers(questions, { q: answer }, true)).toThrow();
    expect(() => validateAnswers(questions, { q: [] }, true)).toThrow(
      /required/i,
    );
  });
  it("scores the exact set regardless of order with no provisional credit for missing or extra choices", () => {
    const { questions, keys } = splitQuestions([multi]);
    expect(
      provisionalMarks(questions, keys, { q: ["Friction", "Gravity"] }).q.score,
    ).toBe(4);
    for (const q of [
      [],
      ["Gravity"],
      ["Gravity", "Friction", "Speed"],
      ["Gravity", "Gravity"],
    ])
      expect(provisionalMarks(questions, keys, { q }).q.score).toBe(0);
  });
  it("keeps attachment arrays restricted to three UUIDs and single answers as text", () => {
    const { questions } = splitQuestions([multi]);
    const file = { ...questions[0], type: "file" as const };
    expect(() => validateAnswers([file], { q: ["Gravity"] })).toThrow();
    expect(() =>
      validateAnswers([file], {
        q: [
          multi.objectiveId,
          multi.objectiveId,
          multi.objectiveId,
          multi.objectiveId,
        ],
      }),
    ).toThrow();
    const single = { ...questions[0], type: "multiple_choice" as const };
    expect(() => validateAnswers([single], { q: ["Gravity"] })).toThrow();
    expect(provisionalMarks([single], {}, {}).q.score).toBe(0);
  });
});
