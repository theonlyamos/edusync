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

const normalizeAnswer = (value: unknown) => String(value ?? '').trim().toLowerCase();

/** Compares one answer, including multi-select answers given as lists. */
export function practiceAnswerIsCorrect(answer: unknown, correct: unknown) {
    if (Array.isArray(correct) || Array.isArray(answer)) {
        const given = new Set((Array.isArray(answer) ? answer : [answer]).map(normalizeAnswer).filter(Boolean));
        const expected = new Set((Array.isArray(correct) ? correct : [correct]).map(normalizeAnswer).filter(Boolean));
        return given.size === expected.size && [...expected].every((value) => given.has(value));
    }
    const given = normalizeAnswer(answer);
    return given !== '' && given === normalizeAnswer(correct);
}

/**
 * Days in a row with at least one finished practice set, counting back from
 * today (or from yesterday, so the streak survives until the day is over).
 */
export function practiceStreak(completedAt: string[], timeZone = 'UTC', now = new Date()) {
  const dayOf = (value: Date) =>
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
  const days = new Set(
    completedAt
      .map((value) => new Date(value))
      .filter((date) => !Number.isNaN(date.getTime()))
      .map(dayOf),
  );
  const cursor = new Date(now);
  if (!days.has(dayOf(cursor))) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let streak = 0;
  while (days.has(dayOf(cursor))) {
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}
