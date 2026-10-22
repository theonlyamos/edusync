import type { Answers, Marks, Question } from "./domain";

// Summaries for the teacher's homework performance page. Pure so they can be tested.

export interface MarkedSubmission {
  studentId: string;
  name: string;
  answers: Answers;
  marks: Marks;
}

export interface QuestionInsight {
  questionId: string;
  number: number;
  prompt: string;
  /** Share of available marks earned, 0-100. */
  percent: number;
  /** Students with full marks on this question. */
  fullMarks: number;
  /** Choice questions only: the wrong answer picked most often. */
  commonWrongAnswer: { answer: string; count: number } | null;
}

const CHOICE = ["multiple_choice", "multiple_select", "true_false"];

function answerText(value: Answers[string] | undefined) {
  if (Array.isArray(value)) return [...value].sort().join(", ");
  return typeof value === "string" ? value.trim() : "";
}

export function questionInsights(
  questions: Question[],
  submissions: MarkedSubmission[],
): QuestionInsight[] {
  return questions.map((q, index) => {
    let earned = 0,
      fullMarks = 0;
    const wrong = new Map<string, number>();
    for (const s of submissions) {
      const score = s.marks[q.id]?.score ?? 0;
      earned += score;
      if (score >= q.points) fullMarks++;
      else if (CHOICE.includes(q.type)) {
        const answer = answerText(s.answers[q.id]);
        if (answer) wrong.set(answer, (wrong.get(answer) ?? 0) + 1);
      }
    }
    let commonWrongAnswer: QuestionInsight["commonWrongAnswer"] = null;
    for (const [answer, count] of wrong)
      if (!commonWrongAnswer || count > commonWrongAnswer.count)
        commonWrongAnswer = { answer, count };
    const possible = q.points * submissions.length;
    return {
      questionId: q.id,
      number: index + 1,
      prompt: q.prompt,
      percent: possible ? Math.round((100 * earned) / possible) : 0,
      fullMarks,
      commonWrongAnswer,
    };
  });
}

export const SCORE_BANDS = ["Below 50%", "50–69%", "70–89%", "90–100%"] as const;

/** Students in each score band, lowest band first, names sorted. */
export function scoreBands(questions: Question[], submissions: MarkedSubmission[]) {
  const possible = questions.reduce((n, q) => n + q.points, 0);
  const bands: { name: string; percent: number }[][] = SCORE_BANDS.map(() => []);
  for (const s of submissions) {
    const total = questions.reduce((n, q) => n + (s.marks[q.id]?.score ?? 0), 0);
    const percent = possible ? Math.round((100 * total) / possible) : 0;
    bands[percent < 50 ? 0 : percent < 70 ? 1 : percent < 90 ? 2 : 3].push({
      name: s.name,
      percent,
    });
  }
  return bands.map((band) => band.sort((a, b) => a.name.localeCompare(b.name)));
}

export function plural(count: number, one: string, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}
