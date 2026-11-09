'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useHomeworkData } from '@/components/homework/shared';
import { NATIVE_SELECT_CLASS } from '@/components/school-portal/PersonFormDialog';
import { attendanceRate, gradebookCsv, shiftDay, type AttendanceTotals, type Gradebook } from '@/lib/school-records';
import { cn } from '@/lib/utils';
import { ClassSelect, LoadError, Loading, Notice, WithClasses, classTitle, type RecordsClasses } from './shared';

const PERIODS = [[30, 'Last 30 days'], [90, 'Last 90 days'], [180, 'Last 6 months'], [365, 'Last 12 months']] as const;

type Loaded = { gradebook: Gradebook; attendance: Record<string, AttendanceTotals>; from: string; to: string };

const tone = (value: number | null) =>
  value === null ? 'text-muted-foreground' : value < 50 ? 'text-red-600 dark:text-red-400' : value < 70 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400';

function Grid({ classId, days, today, fileName }: { classId: string; days: number; today: string; fileName: string }) {
  const book = useHomeworkData<Loaded>(`/api/records/gradebook?classId=${classId}&from=${shiftDay(today, -days)}&to=${today}`);
  if (book.loading && !book.data) return <Loading />;
  if (book.error || !book.data) return <LoadError message={book.error || 'Could not load the gradebook.'} retry={() => void book.refresh()} />;
  const { gradebook, attendance } = book.data;
  if (gradebook.rows.length === 0) return <Notice>This class has no students yet.</Notice>;

  const download = () => {
    const url = URL.createObjectURL(new Blob([`﻿${gradebookCsv(gradebook)}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${fileName}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {gradebook.columns.length === 0
            ? 'No marks have been released in this period yet.'
            : <>Class average <span className={cn('font-semibold', tone(gradebook.classAverage))}>{gradebook.classAverage ?? '–'}%</span> across {gradebook.columns.length} pieces of work</>}
        </p>
        <Button variant="outline" onClick={download} className="min-h-11"><Download className="mr-2 h-4 w-4" /> Download CSV</Button>
      </div>
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Gradebook, scroll sideways for more work">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th scope="col" className="sticky left-0 z-10 min-w-[10rem] bg-card px-4 py-3 font-medium">Student</th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">Average</th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">Attendance</th>
                  {gradebook.columns.map((column) => (
                    <th key={column.key} scope="col" className="min-w-[7rem] max-w-[11rem] px-3 py-3 text-right align-bottom font-medium">
                      <span className="line-clamp-2 break-words" title={column.title}>{column.title}</span>
                      <span className="block text-xs font-normal text-muted-foreground">{column.subject || (column.kind === 'homework' ? 'Homework' : 'Assessment')}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gradebook.rows.map((row) => {
                  const rate = attendance[row.studentId] ? attendanceRate(attendance[row.studentId]) : null;
                  return (
                    <tr key={row.studentId} className="border-b last:border-0">
                      <th scope="row" className="sticky left-0 z-10 bg-card px-4 py-2.5 text-left font-medium">{row.name}</th>
                      <td className={cn('px-3 py-2.5 text-right font-semibold tabular-nums', tone(row.average))}>{row.average === null ? '–' : `${row.average}%`}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{rate === null ? '–' : `${rate}%`}</td>
                      {gradebook.columns.map((column) => {
                        const value = row.cells[column.key] ?? null;
                        return <td key={column.key} className={cn('px-3 py-2.5 text-right tabular-nums', tone(value))}>{value === null ? '–' : `${value}%`}</td>;
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">Marks appear once homework is released to students or an assessment is handed in. A dash means no mark yet.</p>
    </div>
  );
}

function Picker({ data }: { data: RecordsClasses }) {
  const [classId, setClassId] = useState(data.classes[0].id);
  const [days, setDays] = useState(90);
  const current = data.classes.find((c) => c.id === classId) ?? data.classes[0];
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,18rem)_minmax(0,14rem)] sm:items-end">
        <ClassSelect classes={data.classes} value={classId} onChange={setClassId} />
        <div className="space-y-1.5">
          <Label htmlFor="gradebook-period">Period</Label>
          <select id="gradebook-period" className={NATIVE_SELECT_CLASS} value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {PERIODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
      </div>
      <Grid key={`${classId}:${days}`} classId={classId} days={days} today={data.today} fileName={`gradebook-${classTitle(current).replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${data.today}`} />
    </div>
  );
}

/** Every student's marks for a class in one grid. */
export function GradebookView() {
  return <WithClasses>{(data) => <Picker data={data} />}</WithClasses>;
}
