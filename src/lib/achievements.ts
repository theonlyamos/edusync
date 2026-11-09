/** What a student has done so far. Every badge is worked out from these counts. */
export type AchievementCounts = {
  /** Days in a row with some practice, counting today or yesterday. */
  streak: number;
  practiceSets: number;
  /** Practice sets with every answer right. */
  perfectSets: number;
  homeworkHandedIn: number;
  assessmentsPassed: number;
};

export type BadgeGroup = 'streak' | 'practice' | 'perfect' | 'homework' | 'assessment';

type Ladder = { group: BadgeGroup; count: keyof AchievementCounts; unit: [string, string]; steps: { at: number; name: string }[] };

// Each ladder is one kind of effort with rising targets. Order sets the display order.
const LADDERS: Ladder[] = [
  { group: 'streak', count: 'streak', unit: ['day in a row', 'days in a row'], steps: [{ at: 3, name: 'Warming up' }, { at: 7, name: 'One week strong' }, { at: 14, name: 'Two week run' }, { at: 30, name: 'Month of practice' }] },
  { group: 'practice', count: 'practiceSets', unit: ['practice set', 'practice sets'], steps: [{ at: 1, name: 'First steps' }, { at: 10, name: 'Getting the habit' }, { at: 25, name: 'Practice regular' }, { at: 50, name: 'Practice pro' }, { at: 100, name: 'Century' }] },
  { group: 'perfect', count: 'perfectSets', unit: ['perfect score', 'perfect scores'], steps: [{ at: 1, name: 'Full marks' }, { at: 5, name: 'Sharp' }, { at: 20, name: 'Flawless' }] },
  { group: 'homework', count: 'homeworkHandedIn', unit: ['homework handed in', 'homework handed in'], steps: [{ at: 1, name: 'Handed in' }, { at: 5, name: 'On it' }, { at: 15, name: 'Homework hero' }, { at: 40, name: 'Never misses' }] },
  { group: 'assessment', count: 'assessmentsPassed', unit: ['assessment passed', 'assessments passed'], steps: [{ at: 1, name: 'Passed' }, { at: 5, name: 'Test ready' }, { at: 15, name: 'Top of the class' }] },
];

export type Badge = {
  id: string;
  group: BadgeGroup;
  name: string;
  /** What earns it, e.g. "7 days in a row". */
  goal: string;
  target: number;
  have: number;
  earned: boolean;
};

const goalText = (at: number, unit: [string, string]) => `${at} ${at === 1 ? unit[0] : unit[1]}`;

/** Every badge with the student's progress towards it. */
export function badgesFor(counts: AchievementCounts): Badge[] {
  return LADDERS.flatMap((ladder) =>
    ladder.steps.map((step) => {
      const have = Math.max(0, Math.floor(Number(counts[ladder.count]) || 0));
      return { id: `${ladder.group}-${step.at}`, group: ladder.group, name: step.name, goal: goalText(step.at, ladder.unit), target: step.at, have: Math.min(have, step.at), earned: have >= step.at };
    }),
  );
}

export type AchievementSummary = {
  counts: AchievementCounts;
  earned: Badge[];
  /** The closest badges not yet earned, nearest first: one per kind of effort. */
  next: Badge[];
  total: number;
};

export function summarizeAchievements(counts: AchievementCounts): AchievementSummary {
  const badges = badgesFor(counts);
  const next = LADDERS.map((ladder) => badges.find((badge) => badge.group === ladder.group && !badge.earned))
    .filter((badge): badge is Badge => Boolean(badge))
    .sort((a, b) => b.have / b.target - a.have / a.target || a.target - a.have - (b.target - b.have));
  return { counts, earned: badges.filter((badge) => badge.earned), next, total: badges.length };
}
