'use client';

import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SUBJECTS } from '@/lib/constants';
import { gradeLevelLabel } from '@/lib/school-registration';
import {
  MAX_PERIODS,
  MAX_SUBJECT_LENGTH,
  TIMETABLE_DAYS,
  formatPeriodTime,
  nextPeriodSlot,
  type Timetable,
  type TimetableCell,
} from '@/lib/timetable';

type Teacher = { id: string; name: string };
type EditingCell = { day: string; periodId: string; subject: string; teacherId: string };

const NO_TEACHER = 'none';
const EMPTY: Timetable = { periods: [], schedule: {} };
const errorText = (error: unknown, fallback: string) => (error as any)?.response?.data?.error ?? fallback;

/** Lets school owners and admins set each grade's weekly timetable. */
export function SchoolTimetablesPanel() {
  const [grades, setGrades] = useState<string[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [grade, setGrade] = useState('');
  const [timetable, setTimetable] = useState<Timetable>(EMPTY);
  const [saved, setSaved] = useState<string>(JSON.stringify(EMPTY));
  const [loading, setLoading] = useState(true);
  const [loadingGrade, setLoadingGrade] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditingCell | null>(null);

  const dirty = JSON.stringify(timetable) !== saved;
  const teacherNames = useMemo(() => new Map(teachers.map((t) => [t.id, t.name])), [teachers]);

  useEffect(() => {
    axios.get('/api/schools/current/timetables')
      .then(({ data }) => {
        setGrades(data.grades ?? []);
        setTeachers(data.teachers ?? []);
      })
      .catch((err) => setError(errorText(err, 'Could not load timetables.')))
      .finally(() => setLoading(false));
  }, []);

  const openGrade = async (next: string) => {
    if (dirty && !window.confirm('You have unsaved changes. Switch grade and lose them?')) return;
    setGrade(next);
    setLoadingGrade(true);
    setError(null);
    setNotice(null);
    try {
      const { data } = await axios.get('/api/schools/current/timetables', { params: { grade: next } });
      const loaded: Timetable = data.timetable ?? EMPTY;
      setTimetable(loaded);
      setSaved(JSON.stringify(loaded));
      if (data.teachers) setTeachers(data.teachers);
    } catch (err) {
      setError(errorText(err, 'Could not load this timetable.'));
      setTimetable(EMPTY);
      setSaved(JSON.stringify(EMPTY));
    } finally {
      setLoadingGrade(false);
    }
  };

  const addPeriod = () => {
    setTimetable((t) => ({ ...t, periods: [...t.periods, { id: crypto.randomUUID(), ...nextPeriodSlot(t.periods) }] }));
  };

  const updatePeriod = (id: string, field: 'startTime' | 'endTime', value: string) => {
    setTimetable((t) => ({ ...t, periods: t.periods.map((p) => (p.id === id ? { ...p, [field]: value } : p)) }));
  };

  const removePeriod = (id: string) => {
    setTimetable((t) => {
      const schedule: Timetable['schedule'] = {};
      for (const [day, cells] of Object.entries(t.schedule)) {
        const { [id]: _removed, ...rest } = cells;
        if (Object.keys(rest).length) schedule[day] = rest;
      }
      return { periods: t.periods.filter((p) => p.id !== id), schedule };
    });
  };

  const saveCell = (cell: EditingCell) => {
    setTimetable((t) => {
      const day = { ...(t.schedule[cell.day] ?? {}) };
      const value: TimetableCell = { subject: cell.subject.trim(), teacherId: cell.teacherId };
      if (!value.subject && !value.teacherId) delete day[cell.periodId];
      else day[cell.periodId] = value;
      const schedule = { ...t.schedule, [cell.day]: day };
      if (!Object.keys(day).length) delete schedule[cell.day];
      return { ...t, schedule };
    });
    setEditing(null);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const { data } = await axios.put('/api/schools/current/timetables', { grade, ...timetable });
      setTimetable(data.timetable);
      setSaved(JSON.stringify(data.timetable));
      setNotice('Saved. Teachers and students in this grade see it now.');
    } catch (err) {
      setError(errorText(err, 'Could not save the timetable.'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Timetables</CardTitle>
        <CardDescription>
          Set each grade&apos;s weekly periods, subjects and teachers. Students see their grade&apos;s timetable and teachers see their own slots.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="timetable-grade">Grade</Label>
            <Select value={grade} onValueChange={openGrade}>
              <SelectTrigger id="timetable-grade" className="w-48"><SelectValue placeholder="Pick a grade" /></SelectTrigger>
              <SelectContent>
                {grades.map((g) => <SelectItem key={g} value={g}>{gradeLevelLabel(g)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {grade && (
            <>
              <Button variant="outline" onClick={addPeriod} disabled={loadingGrade || timetable.periods.length >= MAX_PERIODS}>
                <Plus className="mr-1 h-4 w-4" />Add period
              </Button>
              <Button onClick={save} disabled={!dirty || saving || loadingGrade}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : dirty ? 'Save timetable' : 'Saved'}
              </Button>
            </>
          )}
        </div>

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {notice && <p className="text-sm text-green-700 dark:text-green-400">{notice}</p>}
        {teachers.length === 0 && grade && (
          <p className="text-sm text-muted-foreground">No teachers in your school yet. Add them on the Teachers page to put them on the timetable.</p>
        )}

        {!grade ? (
          <p className="text-sm text-muted-foreground">Pick a grade to see or set its timetable.</p>
        ) : loadingGrade ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : timetable.periods.length === 0 ? (
          <p className="text-sm text-muted-foreground">No periods yet. Add the first one to start this grade&apos;s timetable.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[220px]">Period</TableHead>
                  {TIMETABLE_DAYS.map((day) => <TableHead key={day} className="min-w-[140px]">{day}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {timetable.periods.map((period) => (
                  <TableRow key={period.id}>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Input type="time" aria-label="Starts" value={period.startTime} className="h-8 w-[6.5rem]"
                          onChange={(e) => updatePeriod(period.id, 'startTime', e.target.value)} />
                        <span aria-hidden>–</span>
                        <Input type="time" aria-label="Ends" value={period.endTime} className="h-8 w-[6.5rem]"
                          onChange={(e) => updatePeriod(period.id, 'endTime', e.target.value)} />
                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Remove ${formatPeriodTime(period)}`}
                          onClick={() => removePeriod(period.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                    {TIMETABLE_DAYS.map((day) => {
                      const cell = timetable.schedule[day]?.[period.id];
                      return (
                        <TableCell key={day} className="p-1">
                          <button
                            type="button"
                            onClick={() => setEditing({ day, periodId: period.id, subject: cell?.subject ?? '', teacherId: cell?.teacherId ?? '' })}
                            className="w-full rounded-md p-2 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {cell ? (
                              <>
                                <span className="block font-medium">{cell.subject || 'No subject'}</span>
                                <span className="block text-muted-foreground">
                                  {cell.teacherId ? teacherNames.get(cell.teacherId) ?? 'Teacher left the school' : 'No teacher'}
                                </span>
                              </>
                            ) : (
                              <span className="text-muted-foreground">+ Add</span>
                            )}
                          </button>
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

      <Dialog open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogContent className="sm:max-w-md">
          {editing && (
            <form onSubmit={(e) => { e.preventDefault(); saveCell(editing); }} className="space-y-4">
              <DialogHeader>
                <DialogTitle>{editing.day}</DialogTitle>
                <DialogDescription>
                  {formatPeriodTime(timetable.periods.find((p) => p.id === editing.periodId) ?? { startTime: '', endTime: '' })}, {gradeLevelLabel(grade)}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-1">
                <Label htmlFor="cell-subject">Subject</Label>
                <Input id="cell-subject" list="timetable-subjects" maxLength={MAX_SUBJECT_LENGTH} value={editing.subject}
                  onChange={(e) => setEditing({ ...editing, subject: e.target.value })} placeholder="e.g. Mathematics" autoFocus />
                <datalist id="timetable-subjects">
                  {SUBJECTS.map((s) => <option key={s} value={s} />)}
                </datalist>
              </div>
              <div className="space-y-1">
                <Label htmlFor="cell-teacher">Teacher</Label>
                <Select value={editing.teacherId || NO_TEACHER} onValueChange={(v) => setEditing({ ...editing, teacherId: v === NO_TEACHER ? '' : v })}>
                  <SelectTrigger id="cell-teacher"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_TEACHER}>No teacher</SelectItem>
                    {teachers.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter className="gap-2 sm:justify-between">
                <Button type="button" variant="ghost" onClick={() => saveCell({ ...editing, subject: '', teacherId: '' })}>Clear slot</Button>
                <Button type="submit">Done</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
