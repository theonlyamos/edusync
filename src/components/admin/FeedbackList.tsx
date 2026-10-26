'use client';

import Link from 'next/link';
import { Empty, Pill, formatDateTime } from '@/components/admin/AdminParts';
import type { FeedbackRow } from '@/lib/platform-admin';

const RATING: Record<string, { label: string; tone: 'good' | 'muted' | 'bad' }> = {
  positive: { label: 'Good', tone: 'good' },
  neutral: { label: 'Okay', tone: 'muted' },
  negative: { label: 'Poor', tone: 'bad' },
};

const TRIGGER: Record<string, string> = { manual_stop: 'After they ended the session', connection_reset: 'After the connection dropped', error: 'After an error' };

const RECOMMEND: Record<string, string> = { yes: 'Would recommend', no: 'Would not recommend', maybe: 'Might recommend' };

function minutes(seconds: number | null) {
  if (!seconds) return null;
  const m = Math.round(seconds / 60);
  return m < 1 ? 'under a minute' : `${m} min session`;
}

/** Tutor feedback, newest first. */
export function FeedbackList({ rows, empty, showUser = true }: { rows: FeedbackRow[]; empty: string; showUser?: boolean }) {
  if (rows.length === 0) return <Empty>{empty}</Empty>;
  return (
    <ul className="divide-y">
      {rows.map((row) => {
        const rating = row.rating ? RATING[row.rating] : null;
        const meta = [row.wouldRecommend ? RECOMMEND[row.wouldRecommend] ?? row.wouldRecommend : null, minutes(row.durationSeconds), row.trigger ? TRIGGER[row.trigger] ?? row.trigger : null].filter(Boolean);
        return (
          <li key={row.id} className="space-y-1.5 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                {rating ? <Pill tone={rating.tone}>{rating.label}</Pill> : <Pill>No rating</Pill>}
                {showUser && (
                  row.user ? (
                    <Link href={`/admin/users/${row.user.id}`} className="break-all text-sm font-medium hover:underline">{row.user.name || row.user.email}</Link>
                  ) : (
                    <span className="text-sm text-muted-foreground">Anonymous</span>
                  )
                )}
              </div>
              <time dateTime={row.createdAt} className="text-xs text-muted-foreground">{formatDateTime(row.createdAt)}</time>
            </div>
            {row.experience && <p className="whitespace-pre-line break-words text-sm">{row.experience}</p>}
            {row.improvements && (
              <p className="whitespace-pre-line break-words text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Could be better: </span>
                {row.improvements}
              </p>
            )}
            {row.error && <p className="break-words text-xs text-destructive">Error during the session: {row.error}</p>}
            {meta.length > 0 && <p className="text-xs text-muted-foreground">{meta.join(' · ')}</p>}
          </li>
        );
      })}
    </ul>
  );
}
