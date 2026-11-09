'use client';

import { Award, BookOpenCheck, Flame, GraduationCap, Sparkles, Target, type LucideIcon } from 'lucide-react';
import { DashboardSection } from '@/components/dashboard/DashboardParts';
import { useHomeworkData } from '@/components/homework/shared';
import type { AchievementSummary, Badge, BadgeGroup } from '@/lib/achievements';

const GROUP_ICON: Record<BadgeGroup, LucideIcon> = {
  streak: Flame,
  practice: Target,
  perfect: Sparkles,
  homework: BookOpenCheck,
  assessment: GraduationCap,
};

function Progress({ badge }: { badge: Badge }) {
  const Icon = GROUP_ICON[badge.group];
  const percent = Math.round((badge.have / badge.target) * 100);
  return (
    <li className="flex items-center gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-muted-foreground"><Icon className="h-4 w-4" aria-hidden /></span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2 text-sm">
          <span className="min-w-0 break-words font-medium">{badge.name}</span>
          <span className="shrink-0 text-muted-foreground">{badge.have} of {badge.target}</span>
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={badge.target} aria-valuenow={badge.have} aria-label={`${badge.name}: ${badge.goal}`}>
          <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{badge.goal}</p>
      </div>
    </li>
  );
}

/** The student's practice streak, the badges they have earned and the ones within reach. */
export function AchievementsCard() {
  const request = useHomeworkData<AchievementSummary>('/api/students/achievements');
  const data = request.data;
  const streak = data?.counts.streak ?? 0;
  return (
    <DashboardSection title="Streak and badges" icon={<Award className="h-5 w-5 text-primary" />} loading={request.loading} error={request.error} retry={request.refresh}>
      {data && (
        <div className="space-y-5">
          <div className="flex items-center gap-3 rounded-lg border p-4">
            <Flame className={streak > 0 ? 'h-8 w-8 shrink-0 text-orange-500' : 'h-8 w-8 shrink-0 text-muted-foreground'} aria-hidden />
            <div className="min-w-0">
              <p className="text-2xl font-bold leading-tight">{streak} {streak === 1 ? 'day' : 'days'}</p>
              <p className="text-sm text-muted-foreground">
                {streak > 0 ? 'Practice streak. Do one practice set each day to keep it going.' : 'No streak yet. Finish a practice set today to start one.'}
              </p>
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-medium">Badges earned ({data.earned.length} of {data.total})</h3>
            {data.earned.length === 0 ? (
              <p className="text-sm text-muted-foreground">Your first badge comes with your first practice set or handed-in homework.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {data.earned.map((badge) => {
                  const Icon = GROUP_ICON[badge.group];
                  return (
                    <li key={badge.id} title={badge.goal} className="flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-sm">
                      <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                      <span>{badge.name}</span>
                      <span className="sr-only">: {badge.goal}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {data.next.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-medium">Next up</h3>
              <ul className="space-y-3">{data.next.slice(0, 3).map((badge) => <Progress key={badge.id} badge={badge} />)}</ul>
            </div>
          )}
        </div>
      )}
    </DashboardSection>
  );
}
