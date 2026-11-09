'use client';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useHomeworkData } from '@/components/homework/shared';
import { LoadError, Loading, Notice } from '@/components/records/shared';
import { AttendanceSummary, ReportCardList } from '@/components/records/StudentRecords';
import type { ParentChild } from '@/lib/school-guardians.server';
import { gradeLevelLabel } from '@/lib/school-registration';

function Child({ child }: { child: ParentChild }) {
  const where = [child.grade ? gradeLevelLabel(child.grade) : null, child.className].filter(Boolean).join(' ');
  return (
    <section aria-label={child.name} className="space-y-4">
      <div>
        <h2 className="break-words text-xl font-semibold">{child.name}</h2>
        <p className="text-sm text-muted-foreground">{[where, child.schoolName].filter(Boolean).join(' · ')}</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <AttendanceSummary totals={child.attendance} />
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-lg">Marks, last 90 days</CardTitle></CardHeader>
          <CardContent>
            {child.subjects.length === 0 ? (
              <p className="text-sm text-muted-foreground">No marked work yet.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {child.subjects.map((subject) => (
                  <li key={subject.subject} className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 break-words">{subject.subject} <span className="text-muted-foreground">({subject.homework + subject.assessments} marked)</span></span>
                    <span className="shrink-0 font-semibold tabular-nums">{subject.percentage === null ? '–' : `${subject.percentage}%`}</span>
                  </li>
                ))}
                <li className="flex items-baseline justify-between gap-3 border-t pt-1.5 font-semibold">
                  <span>Overall</span><span className="tabular-nums">{child.overall === null ? '–' : `${child.overall}%`}</span>
                </li>
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
      <div>
        <h3 className="mb-2 font-medium">Report cards</h3>
        <ReportCardList cards={child.cards} hrefFor={(card) => `/parents/report-cards/${card.id}`} empty="No report cards yet. You’ll get a notification when the school shares one." />
      </div>
    </section>
  );
}

function Children() {
  const mine = useHomeworkData<{ children: ParentChild[] }>('/api/parents/me');
  if (mine.loading && !mine.data) return <Loading />;
  if (mine.error || !mine.data) return <LoadError message={mine.error || 'Could not load your children’s records.'} retry={() => void mine.refresh()} />;
  if (mine.data.children.length === 0) return <Notice>Your account isn’t linked to a student. Ask the school to add you as a parent.</Notice>;
  return <div className="space-y-10">{mine.data.children.map((child) => <Child key={`${child.schoolId}:${child.studentId}`} child={child} />)}</div>;
}

export default function ParentsPage() {
  return (
    <DashboardLayout portal="parent">
      <div className="mb-6">
        <h1 className="text-2xl font-bold sm:text-3xl">My children</h1>
        <p className="mt-1 text-muted-foreground">Attendance, marks and report cards from school.</p>
      </div>
      <Children />
    </DashboardLayout>
  );
}
