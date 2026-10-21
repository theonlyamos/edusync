// The practice tables were created with unquoted camelCase names, so Postgres
// stores the columns in lowercase (studentid, totalexercisescompleted, ...).
// These helpers keep the database names in one place and give the app
// camelCase values.

export const RECENT_SCORE_LIMIT = 10;

export interface PracticeStatsRow {
  studentid: string;
  totalexercisescompleted: number | null;
  totalpointsearned: number | null;
  recentscores: (number | string)[] | null;
  lastpracticedate: string | null;
}

export interface PracticeStats {
  studentId: string;
  totalExercisesCompleted: number;
  totalPointsEarned: number;
  recentScores: number[];
  lastPracticeDate: string | null;
  averageScore: number;
}

export function averageOf(scores: number[]) {
  return scores.length
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : 0;
}

export function practiceStatsFromRow(
  studentId: string,
  row: PracticeStatsRow | null | undefined,
): PracticeStats {
  // numeric[] can come back as strings from PostgREST.
  const recentScores = (row?.recentscores ?? [])
    .map(Number)
    .filter((n) => Number.isFinite(n));
  return {
    studentId,
    totalExercisesCompleted: row?.totalexercisescompleted ?? 0,
    totalPointsEarned: row?.totalpointsearned ?? 0,
    recentScores,
    lastPracticeDate: row?.lastpracticedate ?? null,
    averageScore: averageOf(recentScores),
  };
}

export function nextPracticeStatsRow(
  current: PracticeStats,
  result: { percentage: number; earnedPoints: number },
  completedAt: string,
): PracticeStatsRow {
  return {
    studentid: current.studentId,
    totalexercisescompleted: current.totalExercisesCompleted + 1,
    totalpointsearned: current.totalPointsEarned + result.earnedPoints,
    recentscores: [...current.recentScores, result.percentage].slice(
      -RECENT_SCORE_LIMIT,
    ),
    lastpracticedate: completedAt,
  };
}
