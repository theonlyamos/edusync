'use client';

import Link from 'next/link';
import { FileText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useHomeworkData } from '@/components/homework/shared';
import { ATTENDANCE_LABEL, ATTENDANCE_STATUSES, attendanceRate, dayLabel, type AttendanceTotals, type ReportCard } from '@/lib/school-records';
import { LoadError, Loading, Notice } from './shared';

export function AttendanceSummary({ totals }: { totals: AttendanceTotals }) {
  const rate = attendanceRate(totals);
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-lg">Attendance, last 90 days</CardTitle></CardHeader>
      <CardContent>
        {totals.days === 0 ? (
          <p className="text-sm text-muted-foreground">No register has been taken yet.</p>
        ) : (
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
            <p><span className="text-3xl font-bold tabular-nums">{rate}%</span> <span className="text-sm text-muted-foreground">in class</span></p>
            <p className="text-sm text-muted-foreground">
              {ATTENDANCE_STATUSES.map((status) => `${totals[status]} ${ATTENDANCE_LABEL[status].toLowerCase()}`).join(' · ')} of {totals.days} days
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ReportCardList({ cards, hrefFor, empty }: { cards: ReportCard[]; hrefFor: (card: ReportCard) => string; empty: string }) {
  if (cards.length === 0) return <Notice>{empty}</Notice>;
  return (
    <ul className="space-y-3">
      {cards.map((card) => (
        <li key={card.id}>
          <Link href={hrefFor(card)} className="flex items-center gap-4 rounded-lg border bg-card p-4 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <FileText className="h-6 w-6 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block break-words font-medium">{card.term}</span>
              <span className="block text-sm text-muted-foreground">{dayLabel(card.periodStart)} to {dayLabel(card.periodEnd)}</span>
            </span>
            <span className="shrink-0 text-lg font-semibold tabular-nums">{card.snapshot.overall === null ? '–' : `${card.snapshot.overall}%`}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** A student's own attendance and report cards. */
export function StudentRecords() {
  const mine = useHomeworkData<{ cards: ReportCard[]; attendance: AttendanceTotals }>('/api/records/mine');
  if (mine.loading && !mine.data) return <Loading />;
  if (/not in a school/i.test(mine.error)) return <Notice>Report cards come from a school. Your account isn’t part of one yet.</Notice>;
  if (mine.error || !mine.data) return <LoadError message={mine.error || 'Could not load your report cards.'} retry={() => void mine.refresh()} />;
  return (
    <div className="space-y-6">
      <AttendanceSummary totals={mine.data.attendance} />
      <ReportCardList cards={mine.data.cards} hrefFor={(card) => `/students/report-cards/${card.id}`} empty="No report cards yet. They show up here when your teacher shares one." />
    </div>
  );
}
