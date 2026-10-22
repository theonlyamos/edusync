'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CalendarDays, Loader2, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TIMETABLE_DAYS, formatPeriodTime } from '@/lib/timetable';
import { cn } from '@/lib/utils';

interface TimeTableCell {
  subject: string;
  teacherId: string;
  teacherName: string;
}

type TimeTable = Record<string, Record<string, TimeTableCell>>;

interface Period {
  id: string;
  startTime: string;
  endTime: string;
}

/** Monday to Friday name for today, or null at the weekend. */
function todayName(): string | null {
  const name = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  return (TIMETABLE_DAYS as readonly string[]).includes(name) ? name : null;
}

function Slot({ cell }: { cell?: TimeTableCell }) {
  if (!cell) return <span className="text-sm text-muted-foreground">Free</span>;
  return (
    <div className="space-y-1">
      <p className="font-medium text-primary break-words">{cell.subject}</p>
      <p className="flex items-center gap-1 text-xs text-muted-foreground break-words">
        <User className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {cell.teacherName}
      </p>
    </div>
  );
}

export function StudentTimeTable() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeTable, setTimeTable] = useState<TimeTable>({});
  const [periods, setPeriods] = useState<Period[]>([]);
  const today = todayName();
  const [selectedDay, setSelectedDay] = useState<string>(today ?? TIMETABLE_DAYS[0]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/students/timetable');
      if (!res.ok) throw new Error('Failed to fetch timetable');
      const data = await res.json();
      setTimeTable(data.timeTable || {});
      setPeriods(data.periods || []);
    } catch (fetchError) {
      console.error('Error loading timetable:', fetchError);
      setError('Your timetable could not be loaded. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="p-3 sm:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold sm:text-3xl">Timetable</h1>
        <p className="mt-1 text-muted-foreground">Your class schedule for the week.</p>
      </div>

      {loading ? (
        <div role="status" className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading your timetable…
        </div>
      ) : error ? (
        <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-xl border border-dashed p-8 text-center">
          <AlertTriangle className="h-8 w-8 text-amber-500" />
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" onClick={() => void load()}>Try again</Button>
        </div>
      ) : periods.length === 0 ? (
        <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-xl border border-dashed p-8 text-center">
          <CalendarDays className="h-8 w-8 text-muted-foreground" />
          <h2 className="font-semibold">No timetable yet</h2>
          <p className="text-sm text-muted-foreground">
            Your school hasn&apos;t published a timetable for your class. It will show up here once they do.
          </p>
        </div>
      ) : (
        <>
          {/* Phone and tablet: one day at a time. */}
          <div className="lg:hidden">
            <div role="tablist" aria-label="Day" className="mb-4 grid grid-cols-5 gap-1 rounded-lg bg-muted p-1">
              {TIMETABLE_DAYS.map((day) => (
                <button
                  key={day}
                  type="button"
                  role="tab"
                  aria-selected={selectedDay === day}
                  onClick={() => setSelectedDay(day)}
                  className={cn(
                    'min-h-11 rounded-md text-sm font-medium transition-colors',
                    selectedDay === day ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {day.slice(0, 3)}
                  {day === today ? <span className="sr-only"> (today)</span> : null}
                  {day === today ? <span aria-hidden className="mx-auto mt-0.5 block h-1 w-1 rounded-full bg-primary" /> : null}
                </button>
              ))}
            </div>
            <ul className="space-y-2">
              {periods.map((period) => (
                <li key={period.id}>
                  <Card>
                    <CardContent className="flex gap-4 p-4">
                      <p className="w-28 shrink-0 text-sm font-medium tabular-nums">{formatPeriodTime(period)}</p>
                      <div className="min-w-0 flex-1">
                        <Slot cell={timeTable[selectedDay]?.[period.id]} />
                      </div>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          </div>

          {/* Desktop: the whole week. */}
          <Card className="hidden lg:block">
            <CardContent className="p-0">
              <Table aria-label="Weekly class timetable" className="table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-36">Time</TableHead>
                    {TIMETABLE_DAYS.map((day) => (
                      <TableHead key={day} className={cn(day === today && 'bg-primary/10 text-foreground')}>
                        {day}
                        {day === today ? <span className="ml-2 text-xs font-normal text-primary">Today</span> : null}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {periods.map((period) => (
                    <TableRow key={period.id}>
                      <TableCell className="whitespace-nowrap text-sm font-medium tabular-nums">{formatPeriodTime(period)}</TableCell>
                      {TIMETABLE_DAYS.map((day) => (
                        <TableCell key={`${day}-${period.id}`} className={cn('align-top', day === today && 'bg-primary/5')}>
                          <Slot cell={timeTable[day]?.[period.id]} />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
