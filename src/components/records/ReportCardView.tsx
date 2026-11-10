'use client';

import Link from 'next/link';
import { ArrowLeft, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useHomeworkData } from '@/components/homework/shared';
import { gradeLevelLabel } from '@/lib/school-registration';
import { ATTENDANCE_LABEL, ATTENDANCE_STATUSES, attendanceRate, dayLabel, type ReportCard } from '@/lib/school-records';
import { LoadError, Loading } from './shared';

/** The report card as a sheet of paper: what a student, parent or teacher reads and prints. */
export function ReportCardSheet({ card, schoolLogoUrl = null }: { card: ReportCard; schoolLogoUrl?: string | null }) {
  const s = card.snapshot;
  const rate = attendanceRate(s.attendance);
  return (
    <article className="mx-auto max-w-3xl rounded-lg border bg-card p-6 text-card-foreground print:max-w-none print:border-0 print:bg-white print:p-0 print:text-black sm:p-8">
      <header className="flex items-start gap-4 border-b pb-4">
        {schoolLogoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- school logos live in Supabase storage
          <img src={schoolLogoUrl} alt={`${s.schoolName} logo`} className="h-16 w-16 shrink-0 object-contain" />
        )}
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground print:text-black">{s.schoolName}</p>
          <h1 className="mt-1 break-words text-2xl font-bold">{card.term} report card</h1>
          <p className="mt-1 text-sm text-muted-foreground print:text-black">{dayLabel(card.periodStart)} to {dayLabel(card.periodEnd)}</p>
        </div>
      </header>
      <dl className="grid gap-x-6 gap-y-2 border-b py-4 text-sm sm:grid-cols-3">
        <div><dt className="text-muted-foreground print:text-black">Student</dt><dd className="break-words font-medium">{s.studentName}</dd></div>
        <div><dt className="text-muted-foreground print:text-black">Class</dt><dd className="font-medium">{[s.grade ? gradeLevelLabel(s.grade) : null, s.className].filter(Boolean).join(' ') || '–'}</dd></div>
        <div><dt className="text-muted-foreground print:text-black">Overall</dt><dd className="font-medium">{s.overall === null ? 'No marks yet' : `${s.overall}%`}</dd></div>
      </dl>

      <section className="py-4">
        <h2 className="mb-2 text-lg font-semibold">Subjects</h2>
        {s.subjects.length === 0 ? (
          <p className="text-sm text-muted-foreground print:text-black">No marked work in this period.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th scope="col" className="py-2 font-medium">Subject</th>
                <th scope="col" className="py-2 text-right font-medium">Homework</th>
                <th scope="col" className="py-2 text-right font-medium">Assessments</th>
                <th scope="col" className="py-2 text-right font-medium">Mark</th>
              </tr>
            </thead>
            <tbody>
              {s.subjects.map((subject) => (
                <tr key={subject.subject} className="border-b last:border-0">
                  <th scope="row" className="break-words py-2 text-left font-normal">{subject.subject}</th>
                  <td className="py-2 text-right tabular-nums">{subject.homework}</td>
                  <td className="py-2 text-right tabular-nums">{subject.assessments}</td>
                  <td className="py-2 text-right font-semibold tabular-nums">{subject.percentage === null ? '–' : `${subject.percentage}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="border-t py-4">
        <h2 className="mb-2 text-lg font-semibold">Attendance</h2>
        {s.attendance.days === 0 ? (
          <p className="text-sm text-muted-foreground print:text-black">No register was kept in this period.</p>
        ) : (
          <p className="text-sm">
            In class {rate}% of {s.attendance.days} days:{' '}
            {ATTENDANCE_STATUSES.map((status) => `${s.attendance[status]} ${ATTENDANCE_LABEL[status].toLowerCase()}`).join(', ')}.
          </p>
        )}
      </section>

      <section className="border-t pt-4">
        <h2 className="mb-2 text-lg font-semibold">Teacher’s comment</h2>
        <p className="whitespace-pre-wrap break-words text-sm">{card.comment || 'No comment.'}</p>
      </section>
    </article>
  );
}

/** A page showing one report card, with Back and Print. */
export function ReportCardPage({ id, backHref, source = '/api/records/report-cards' }: { id: string; backHref: string; source?: string }) {
  const loaded = useHomeworkData<{ card: ReportCard; schoolLogoUrl?: string | null }>(`${source}/${id}`);
  if (loaded.loading && !loaded.data) return <Loading />;
  if (loaded.error || !loaded.data) return <LoadError message={loaded.error || 'Could not load the report card.'} retry={() => void loaded.refresh()} />;
  const { card } = loaded.data;
  return (
    <div className="space-y-4">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2 print:hidden">
        <Button variant="ghost" asChild className="min-h-11"><Link href={backHref}><ArrowLeft className="mr-2 h-4 w-4" /> Back</Link></Button>
        <div className="flex items-center gap-3">
          {!card.publishedAt && <span className="rounded-full border px-2.5 py-1 text-xs font-medium text-muted-foreground">Draft, not shared yet</span>}
          <Button variant="outline" onClick={() => window.print()} className="min-h-11"><Printer className="mr-2 h-4 w-4" /> Print or save as PDF</Button>
        </div>
      </div>
      <ReportCardSheet card={card} schoolLogoUrl={loaded.data.schoolLogoUrl ?? null} />
    </div>
  );
}
