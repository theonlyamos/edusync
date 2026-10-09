import { describe, expect, it } from "vitest";
import {
  draftSchema,
  splitQuestions,
  validateAnswers,
  validateMarks,
  aggregatePerformance,
  validateFile,
  provisionalMarks,
} from "../domain";

const objectiveId = "11111111-1111-4111-8111-111111111111";
const qs = [
  {
    id: "q1",
    type: "multiple_choice",
    prompt: "What pulls objects down?",
    objectiveId,
    points: 2,
    required: true,
    options: ["Gravity", "Friction"],
    correctAnswer: "Gravity",
    guidance: "Private key",
  },
  {
    id: "q2",
    type: "written",
    prompt: "Explain friction.",
    objectiveId,
    points: 6,
    required: true,
    options: [],
    correctAnswer: "",
    guidance: "Scientific explanation",
    rubric: [
      { label: "Identify force", points: 2 },
      { label: "Explain direction", points: 4 },
    ],
  },
];
describe("homework domain", () => {
  it("separates private keys from the allowlisted student questions", () => {
    const { questions, keys } = splitQuestions(qs);
    expect(JSON.stringify(questions)).not.toMatch(
      /correctAnswer|guidance|Private key/,
    );
    expect(keys.q1.correctAnswer).toBe("Gravity");
    expect(questions[1].rubric).toHaveLength(2);
  });
  it("rejects duplicate questions, mismatched rubrics and invalid choice keys", () => {
    const base = {
      title: "Forces",
      instructions: "Explain your reasoning",
      lessonId: objectiveId,
      objectiveIds: [objectiveId],
      dueAt: "2026-10-11T18:00:00Z",
      questions: qs,
    };
    expect(draftSchema.safeParse(base).success).toBe(true);
    expect(
      draftSchema.parse({ ...base, publicationId: objectiveId }),
    ).toHaveProperty("publicationId", objectiveId);
    expect(
      draftSchema.safeParse({ ...base, questions: [qs[0], qs[0]] }).success,
    ).toBe(false);
    expect(
      draftSchema.safeParse({
        ...base,
        questions: [{ ...qs[0], correctAnswer: "Unknown" }],
      }).success,
    ).toBe(false);
    expect(
      draftSchema.safeParse({
        ...base,
        questions: [{ ...qs[1], rubric: [{ label: "Force", points: 1 }] }],
      }).success,
    ).toBe(false);
  });
  it("requires completed answers and rejects foreign question IDs or invalid choices", () => {
    const { questions } = splitQuestions(qs);
    expect(() =>
      validateAnswers(
        questions,
        { q1: "Gravity", q2: "Because friction opposes motion." },
        true,
      ),
    ).not.toThrow();
    expect(() => validateAnswers(questions, { q1: "Gravity" }, true)).toThrow(
      /required/i,
    );
    expect(() => validateAnswers(questions, { q1: "Unknown" }, false)).toThrow(
      /choice/i,
    );
    expect(() => validateAnswers(questions, { foreign: "x" }, false)).toThrow(
      /question/i,
    );
  });
  it("bounds grades and checks complete grading and rubric totals", () => {
    const { questions } = splitQuestions(qs);
    expect(() =>
      validateMarks(
        questions,
        {
          q1: { score: 2, feedback: "" },
          q2: { score: 4, feedback: "Good", criteria: [2, 2] },
        },
        true,
      ),
    ).not.toThrow();
    expect(() =>
      validateMarks(questions, { q1: { score: 3, feedback: "" } }, false),
    ).toThrow(/maximum/i);
    expect(() =>
      validateMarks(questions, { q1: { score: 2, feedback: "" } }, true),
    ).toThrow(/mark/i);
    expect(() =>
      validateMarks(
        questions,
        { q2: { score: 5, feedback: "", criteria: [2, 2] } },
        false,
      ),
    ).toThrow(/rubric/i);
  });
  it("scores only objective questions provisionally", () => {
    const { questions, keys } = splitQuestions(qs);
    expect(
      provisionalMarks(questions, keys, { q1: "Gravity", q2: "anything" }),
    ).toEqual({ q1: { score: 2, feedback: "" } });
  });
  it("weights scores by points, excludes private marks, and replaces revised attempts", () => {
    const result = aggregatePerformance([
      {
        homeworkId: "a",
        attempt: 1,
        releasedAt: "2026-10-01",
        earned: 1,
        possible: 2,
        late: false,
      },
      {
        homeworkId: "a",
        attempt: 2,
        releasedAt: "2026-10-03",
        earned: 2,
        possible: 2,
        late: true,
      },
      {
        homeworkId: "b",
        attempt: 1,
        releasedAt: "2026-10-02",
        earned: 4,
        possible: 8,
        late: false,
      },
      {
        homeworkId: "c",
        attempt: 1,
        releasedAt: null,
        earned: 99,
        possible: 100,
        late: false,
      },
    ]);
    expect(result).toMatchObject({
      count: 2,
      earned: 6,
      possible: 10,
      percentage: 60,
      onTime: 1,
    });
  });
  it("rejects unsupported, oversized, empty and misleading attachments", () => {
    expect(() => validateFile("diagram.png", "image/png", 1024)).not.toThrow();
    expect(() =>
      validateFile("a.exe", "application/octet-stream", 3),
    ).toThrow();
    expect(() => validateFile("a.png", "text/html", 3)).toThrow();
    expect(() =>
      validateFile("a.pdf", "application/pdf", 10 * 1024 * 1024 + 1),
    ).toThrow();
    expect(() => validateFile("a.pdf", "application/pdf", 0)).toThrow();
  });
});
