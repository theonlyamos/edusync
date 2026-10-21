'use client';

import { useContext, useEffect, useState } from 'react';
import { AppUserContext } from '@/components/providers/SupabaseAuthProvider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Book, Calendar, GraduationCap, Loader2 } from 'lucide-react';
import { gradeLevelLabel } from '@/lib/school-registration';
import { formatPeriodTime, TIMETABLE_DAYS } from '@/lib/timetable';

type Cell = { subject: string; teacherId: string; level: string };
type Period = { id: string; startTime: string; endTime: string; level: string };

/** The teacher's own weekly slots, read-only. School admins set the timetable. */
export function TeacherTimeTable() {
  const { user: appUser } = useContext(AppUserContext);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeTable, setTimeTable] = useState<Record<string, Record<string, Cell>>>({});
  const [periods, setPeriods] = useState<Period[]>([]);

  useEffect(() => {
    if (appUser?.role !== 'teacher') return;
    fetch('/api/teachers/timetable')
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const data = await res.json();
        setTimeTable(data.timeTable ?? {});
        setPeriods(data.periods ?? []);
      })
      .catch(() => setError('Could not load your timetable.'))
      .finally(() => setLoading(false));
  }, [appUser]);

  if (loading) {
    return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Time Table</h1>
        <p className="text-muted-foreground mt-2">Your teaching slots. Your school&apos;s admins set the timetable.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-orange-500" />
            <span>Weekly schedule</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <p role="alert" className="text-sm text-destructive">{error}</p>
          ) : periods.length === 0 ? (
            <p className="text-sm text-muted-foreground">You have no slots yet. They appear here once a school admin puts you on a grade&apos;s timetable.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    {TIMETABLE_DAYS.map((day) => <TableHead key={day}>{day}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {periods.map((period) => (
                    <TableRow key={period.id}>
                      <TableCell className="whitespace-nowrap text-sm font-medium">{formatPeriodTime(period)}</TableCell>
                      {TIMETABLE_DAYS.map((day) => {
                        const cell = timeTable[day]?.[period.id];
                        return (
                          <TableCell key={day} className="min-w-[160px]">
                            {cell && (
                              <div className="space-y-1 text-sm">
                                <div className="flex items-center gap-1 text-green-800 dark:text-green-400">
                                  <GraduationCap className="h-4 w-4" />{gradeLevelLabel(cell.level)}
                                </div>
                                <div className="flex items-center gap-1">
                                  <Book className="h-4 w-4" />{cell.subject || 'No subject'}
                                </div>
                              </div>
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
