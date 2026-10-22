import { describe, expect, it } from "vitest";
import { nextPracticeStatsRow, practiceAnswerIsCorrect, practiceStatsFromRow, practiceStreak } from "../practice-stats";

describe("practice stats", () => {
  it("defaults to zero for a student with no practice yet", () => {
    expect(practiceStatsFromRow("s1", null)).toMatchObject({
      totalExercisesCompleted: 0,
      averageScore: 0,
      recentScores: [],
    });
  });

  it("reads lowercase database columns and string scores", () => {
    const stats = practiceStatsFromRow("s1", {
      studentid: "s1",
      totalexercisescompleted: 3,
      totalpointsearned: 20,
      recentscores: ["80", 90, "100"],
      lastpracticedate: "2026-10-20T00:00:00Z",
    });
    expect(stats.averageScore).toBe(90);
    expect(stats.totalExercisesCompleted).toBe(3);
  });

  it("adds a result and keeps the last ten scores", () => {
    const current = practiceStatsFromRow("s1", {
      studentid: "s1",
      totalexercisescompleted: 10,
      totalpointsearned: 50,
      recentscores: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      lastpracticedate: null,
    });
    const row = nextPracticeStatsRow(current, { percentage: 75, earnedPoints: 3 }, "2026-10-21T00:00:00Z");
    expect(row).toEqual({
      studentid: "s1",
      totalexercisescompleted: 11,
      totalpointsearned: 53,
      recentscores: [2, 3, 4, 5, 6, 7, 8, 9, 10, 75],
      lastpracticedate: "2026-10-21T00:00:00Z",
    });
  });
});

describe('practiceAnswerIsCorrect', () => {
  it('matches single answers without caring about case or spaces', () => {
    expect(practiceAnswerIsCorrect(' Newton ', 'newton')).toBe(true);
    expect(practiceAnswerIsCorrect('', '')).toBe(false);
  });
  it('compares multi-select answers as sets', () => {
    expect(practiceAnswerIsCorrect(['B', 'A'], ['a', 'b'])).toBe(true);
    expect(practiceAnswerIsCorrect(['A'], ['A', 'B'])).toBe(false);
    expect(practiceAnswerIsCorrect(undefined, ['A'])).toBe(false);
  });
});

describe('practiceStreak', () => {
  const now = new Date('2026-10-22T15:00:00Z');
  it('counts consecutive days ending today', () => {
    expect(practiceStreak(['2026-10-22T08:00:00Z', '2026-10-21T20:00:00Z', '2026-10-20T09:00:00Z', '2026-10-18T09:00:00Z'], 'UTC', now)).toBe(3);
  });
  it('keeps yesterday\'s streak until today is over', () => {
    expect(practiceStreak(['2026-10-21T08:00:00Z', '2026-10-20T08:00:00Z'], 'UTC', now)).toBe(2);
  });
  it('is zero after a missed day', () => {
    expect(practiceStreak(['2026-10-20T08:00:00Z'], 'UTC', now)).toBe(0);
    expect(practiceStreak([], 'UTC', now)).toBe(0);
  });
});
