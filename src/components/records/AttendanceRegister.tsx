'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCheck, ChevronLeft, ChevronRight, Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { homeworkRequest, useHomeworkData } from '@/components/homework/shared';
import { ATTENDANCE_LABEL, ATTENDANCE_STATUSES, dayLabel, shiftDay, type AttendanceStatus, type Register } from '@/lib/school-records';
import { holidayOn } from '@/lib/school-calendar';
import { cn } from '@/lib/utils';
import { ClassSelect, LoadError, Loading, Notice, WithClasses, type RecordsClasses } from './shared';

const STATUS_STYLE: Record<AttendanceStatus, string> = {
  present: 'border-emerald-600 bg-emerald-600 text-white',
  late: 'border-amber-500 bg-amber-500 text-black',
  absent: 'border-red-600 bg-red-600 text-white',
  excused: 'border-sky-600 bg-sky-600 text-white',
};

type Draft = Record<string, { status: AttendanceStatus | null; note: string }>;

function RegisterSheet({ classId, day, onDirty }: { classId: string; day: string; onDirty: (dirty: boolean) => void }) {
  const { toast } = useToast();
  const register = useHomeworkData<Register>(`/api/records/attendance?classId=${classId}&day=${day}`);
  const [draft, setDraft] = useState<Draft>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!register.data) return;
    setDraft(Object.fromEntries(register.data.rows.map((row) => [row.studentId, { status: row.status, note: row.note }])));
    setDirty(false);
  }, [register.data]);

  // Warn before leaving with marks that haven't been saved. The picker asks
  // too, before it swaps this sheet for another class or day.
  useEffect(() => {
    onDirty(dirty);
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, onDirty]);

  const rows = register.data?.rows ?? [];
  const counts = useMemo(() => {
    const out: Record<string, number> = { present: 0, late: 0, absent: 0, excused: 0, unmarked: 0 };
    for (const row of rows) out[draft[row.studentId]?.status ?? 'unmarked'] += 1;
    return out;
  }, [rows, draft]);

  if (register.loading && !register.data) return <Loading />;
  if (register.error || !register.data) return <LoadError message={register.error || 'Could not load the register.'} retry={() => void register.refresh()} />;
  if (rows.length === 0) return <Notice>This class has no students yet.</Notice>;

  const set = (studentId: string, change: Partial<Draft[string]>) => {
    setDraft((current) => ({ ...current, [studentId]: { ...(current[studentId] ?? { status: null, note: '' }), ...change } }));
    setDirty(true);
  };
  const markRest = () => {
    setDraft((current) => Object.fromEntries(rows.map((row) => [row.studentId, { note: current[row.studentId]?.note ?? '', status: current[row.studentId]?.status ?? 'present' }])));
    setDirty(true);
  };
  const save = async () => {
    const entries = rows.flatMap((row) => {
      const mark = draft[row.studentId];
      return mark?.status ? [{ studentId: row.studentId, status: mark.status, note: mark.note }] : [];
    });
    if (entries.length === 0) return toast({ title: 'Mark at least one student first.', variant: 'destructive' });
    setSaving(true);
    try {
      await homeworkRequest<Register>('/api/records/attendance', { method: 'PUT', body: JSON.stringify({ classId, day, entries }) });
      toast({ title: `Register saved for ${dayLabel(day)}` });
      setDirty(false);
      void register.refresh();
    } catch (error) {
      toast({ title: (error as Error).message || 'Could not save the register.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {counts.present} present · {counts.late} late · {counts.absent} absent · {counts.excused} excused
          {counts.unmarked > 0 && <> · <span className="font-medium text-foreground">{counts.unmarked} not marked</span></>}
        </p>
        {counts.unmarked > 0 && (
          <Button variant="outline" onClick={markRest} className="min-h-11">
            <CheckCheck className="mr-2 h-4 w-4" /> Mark the rest present
          </Button>
        )}
      </div>
      <Card>
        <CardContent className="divide-y p-0">
          {rows.map((row) => {
            const mark = draft[row.studentId] ?? { status: null, note: '' };
            return (
              <div key={row.studentId} className="flex flex-col gap-2 px-4 py-3 lg:flex-row lg:items-center">
                <p className="min-w-0 flex-1 break-words font-medium">{row.name}</p>
                <div role="radiogroup" aria-label={`Attendance for ${row.name}`} className="grid grid-cols-4 gap-1.5 sm:flex">
                  {ATTENDANCE_STATUSES.map((status) => (
                    <button
                      key={status}
                      type="button"
                      role="radio"
                      aria-checked={mark.status === status}
                      onClick={() => set(row.studentId, { status })}
                      className={cn(
                        'min-h-11 rounded-md border px-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-w-[5.25rem]',
                        mark.status === status ? STATUS_STYLE[status] : 'border-input bg-background hover:bg-accent',
                      )}
                    >
                      {ATTENDANCE_LABEL[status]}
                    </button>
                  ))}
                </div>
                {(mark.status === 'absent' || mark.status === 'late' || mark.status === 'excused' || mark.note) && (
                  <Input
                    aria-label={`Note for ${row.name}`}
                    placeholder="Note (optional)"
                    value={mark.note}
                    maxLength={300}
                    onChange={(e) => set(row.studentId, { note: e.target.value })}
                    className="lg:w-56"
                  />
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
      <div className="sticky bottom-0 -mx-3 flex items-center justify-end gap-3 border-t bg-background/95 px-3 py-3 backdrop-blur sm:-mx-4 sm:px-4">
        {dirty && <p className="text-sm text-muted-foreground">Unsaved changes</p>}
        <Button onClick={save} disabled={saving || !dirty} className="min-h-11">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save register
        </Button>
      </div>
    </div>
  );
}

function Picker({ data }: { data: RecordsClasses }) {
  const [classId, setClassId] = useState(data.classes[0].id);
  const [day, setDay] = useState(data.today);
  const [dirty, setDirty] = useState(false);
  const earliest = shiftDay(data.today, -365);
  // Changing class or day replaces the sheet, so check before dropping unsaved marks.
  const leave = (go: () => void) => {
    if (dirty && !window.confirm('This register has marks you haven’t saved. Leave without saving them?')) return;
    setDirty(false);
    go();
  };
  const pickDay = (next: string) => leave(() => setDay(next));
  const holiday = holidayOn(data.calendar ?? [], day);
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,18rem)_auto] sm:items-end">
        <ClassSelect classes={data.classes} value={classId} onChange={(id) => leave(() => setClassId(id))} />
        <div className="space-y-1.5">
          <Label htmlFor="register-day">Date</Label>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="icon" className="h-10 w-10 shrink-0" aria-label="Previous day" disabled={day <= earliest} onClick={() => pickDay(shiftDay(day, -1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Input id="register-day" type="date" value={day} min={earliest} max={data.today} onChange={(e) => { if (e.target.value && e.target.value <= data.today) pickDay(e.target.value); }} className="w-auto" />
            <Button variant="outline" size="icon" className="h-10 w-10 shrink-0" aria-label="Next day" disabled={day >= data.today} onClick={() => pickDay(shiftDay(day, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            {day !== data.today && <Button variant="ghost" onClick={() => pickDay(data.today)}>Today</Button>}
          </div>
        </div>
      </div>
      {holiday && (
        <p role="status" className="rounded-md border border-emerald-600/40 bg-emerald-600/10 px-4 py-3 text-sm">
          The school calendar marks this day as a holiday: <span className="font-medium">{holiday.title}</span>. You can still take the register if the class met.
        </p>
      )}
      <RegisterSheet key={`${classId}:${day}`} classId={classId} day={day} onDirty={setDirty} />
    </div>
  );
}

/** The daily register: pick a class and a day, mark each student, save. */
export function AttendanceRegister() {
  return <WithClasses>{(data) => <Picker data={data} />}</WithClasses>;
}
