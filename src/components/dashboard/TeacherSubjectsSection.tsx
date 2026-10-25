'use client';

import { BookMarked } from 'lucide-react';
import { DashboardEmpty, DashboardSection } from '@/components/dashboard/DashboardParts';
import { SubjectDot } from '@/components/school-portal/SubjectDot';
import { gradeLevelLabel } from '@/lib/school-registration';
import { classLabel } from '@/lib/school-classes';

export type MySubject = {
  subjectId: string;
  subject: string;
  color: string | null;
  grade: string;
  classId: string | null;
  className: string | null;
};

type Request = { data: { mine: MySubject[] } | null; loading: boolean; error?: string; refresh: () => void };

/** Where a teacher teaches a subject: "JHS 1, JHS 2 A". */
export function teachingPlaces(rows: MySubject[]): string {
  return [...new Set(rows.map((r) => {
    const grade = gradeLevelLabel(r.grade);
    return r.className ? classLabel(grade, r.className) : grade;
  }))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).join(', ');
}

/** The subjects and classes the school has set this teacher to teach. */
export function TeacherSubjectsSection({ request }: { request: Request }) {
  const mine = request.data?.mine ?? [];
  const bySubject = new Map<string, MySubject[]>();
  for (const row of mine) bySubject.set(row.subjectId, [...(bySubject.get(row.subjectId) ?? []), row]);
  const subjects = [...bySubject.values()].sort((a, b) => a[0].subject.localeCompare(b[0].subject));

  return (
    <DashboardSection
      title="What you teach"
      icon={<BookMarked className="h-5 w-5 text-primary" />}
      href="/teachers/timetable"
      linkLabel="Timetable"
      loading={request.loading}
      error={request.error}
      retry={request.refresh}
    >
      {subjects.length === 0 ? (
        <DashboardEmpty>Your school hasn&apos;t set which subjects you teach yet.</DashboardEmpty>
      ) : (
        <ul className="divide-y">
          {subjects.map((rows) => (
            <li key={rows[0].subjectId} className="flex items-start gap-3 py-3">
              <SubjectDot color={rows[0].color} className="mt-1.5" />
              <div className="min-w-0">
                <p className="font-medium break-words">{rows[0].subject}</p>
                <p className="text-sm text-muted-foreground break-words">{teachingPlaces(rows)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </DashboardSection>
  );
}
