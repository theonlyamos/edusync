'use client';

import { useState, type FormEvent } from 'react';
import { CalendarDays, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DeleteConfirmationDialog } from '@/components/ui/delete-confirmation-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { homeworkRequest, useHomeworkData } from '@/components/homework/shared';
import { LoadError, Loading, Notice } from '@/components/records/shared';
import { NATIVE_SELECT_CLASS } from '@/components/school-portal/PersonFormDialog';
import { CALENDAR_KINDS, CALENDAR_KIND_LABEL, CALENDAR_TITLE_MAX, daysUntil, groupByTime, holidayOn, termOn, type CalendarEntry, type CalendarKind } from '@/lib/school-calendar';
import { dayLabel } from '@/lib/school-records';
import { cn } from '@/lib/utils';

type Loaded = { entries: CalendarEntry[]; today: string; canEdit: boolean };
type Form = { kind: CalendarKind; title: string; startsOn: string; endsOn: string };

const KIND_STYLE: Record<CalendarKind, string> = {
  term: 'border-primary/40 bg-primary/10 text-foreground',
  holiday: 'border-emerald-600/40 bg-emerald-600/10 text-foreground',
  exam: 'border-amber-500/50 bg-amber-500/15 text-foreground',
  event: 'border-sky-600/40 bg-sky-600/10 text-foreground',
};

const range = (entry: Pick<CalendarEntry, 'startsOn' | 'endsOn'>) =>
  entry.startsOn === entry.endsOn ? dayLabel(entry.startsOn) : `${dayLabel(entry.startsOn)} to ${dayLabel(entry.endsOn)}`;

const startsIn = (entry: CalendarEntry, today: string) => {
  const days = daysUntil(entry, today);
  return days === 1 ? 'Tomorrow' : `In ${days} days`;
};

function EntryRow({ entry, note, canEdit, busy, onEdit, onRemove }: { entry: CalendarEntry; note?: string; canEdit: boolean; busy: boolean; onEdit: () => void; onRemove: () => void }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
      <span className={cn('shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium', KIND_STYLE[entry.kind])}>{CALENDAR_KIND_LABEL[entry.kind]}</span>
      <div className="min-w-0 flex-1 basis-48">
        <p className="break-words font-medium">{entry.title}</p>
        <p className="text-sm text-muted-foreground">{range(entry)}{note ? ` · ${note}` : ''}</p>
      </div>
      {canEdit && (
        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" size="icon" className="h-11 w-11" disabled={busy} aria-label={`Edit ${entry.title}`} title="Edit" onClick={onEdit}><Pencil className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" className="h-11 w-11" disabled={busy} aria-label={`Remove ${entry.title}`} title="Remove" onClick={onRemove}><Trash2 className="h-4 w-4" /></Button>
        </div>
      )}
    </li>
  );
}

/** The school calendar. School admins edit it; teachers and students read it. */
export function SchoolCalendar() {
  const { toast } = useToast();
  const data = useHomeworkData<Loaded>('/api/schools/current/calendar');
  const [form, setForm] = useState<Form | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<CalendarEntry | null>(null);

  if (data.loading && !data.data) return <Loading />;
  if (/not in a school/i.test(data.error)) return <Notice>The calendar belongs to a school. Your account isn’t part of one yet.</Notice>;
  if (data.error || !data.data) return <LoadError message={data.error || 'Could not load the calendar.'} retry={() => void data.refresh()} />;
  const { entries, today, canEdit } = data.data;
  const groups = groupByTime(entries, today);
  const term = termOn(entries, today);
  const holiday = holidayOn(entries, today);
  const nextTerm = groups.upcoming.find((entry) => entry.kind === 'term');
  const blank: Form = { kind: entries.some((entry) => entry.kind === 'term') ? 'holiday' : 'term', title: '', startsOn: today, endsOn: today };
  const current = form ?? blank;

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await homeworkRequest(editing ? `/api/schools/current/calendar/${editing}` : '/api/schools/current/calendar', { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(current) });
      toast({ title: editing ? 'Calendar entry saved' : `${current.title.trim()} added to the calendar` });
      setForm(null);
      setEditing(null);
      void data.refresh();
    } catch (error) {
      toast({ title: (error as Error).message || 'Could not save the calendar entry.', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      await homeworkRequest(`/api/schools/current/calendar/${removing.id}`, { method: 'DELETE' });
      toast({ title: `${removing.title} removed` });
      if (editing === removing.id) { setEditing(null); setForm(null); }
      setRemoving(null);
      void data.refresh();
    } catch (error) {
      toast({ title: (error as Error).message || 'Could not remove the calendar entry.', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };
  const edit = (entry: CalendarEntry) => {
    setEditing(entry.id);
    setForm({ kind: entry.kind, title: entry.title, startsOn: entry.startsOn, endsOn: entry.endsOn });
    document.getElementById('calendar-form')?.scrollIntoView({ block: 'nearest' });
  };
  const rows = (list: CalendarEntry[], note?: (entry: CalendarEntry) => string) =>
    list.map((entry) => <EntryRow key={entry.id} entry={entry} note={note?.(entry)} canEdit={canEdit} busy={busy} onEdit={() => edit(entry)} onRemove={() => setRemoving(entry)} />);

  return (
    <div className={cn('grid gap-6', canEdit && 'lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]')}>
      <div className="min-w-0 space-y-6">
        <Card>
          <CardContent className="flex items-start gap-3 py-4">
            <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0">
              <p className="font-medium">
                {holiday ? `Today is a holiday: ${holiday.title}` : term ? `${term.title} is in session` : nextTerm ? `Between terms. ${nextTerm.title} starts ${dayLabel(nextTerm.startsOn)}.` : entries.length ? 'Between terms' : 'Nothing on the calendar yet'}
              </p>
              <p className="text-sm text-muted-foreground">
                {term && !holiday ? `${dayLabel(term.startsOn)} to ${dayLabel(term.endsOn)}` : holiday ? range(holiday) : entries.length ? dayLabel(today) : canEdit ? 'Add your terms first, then holidays and exam weeks.' : 'Your school hasn’t added its terms and holidays yet.'}
              </p>
            </div>
          </CardContent>
        </Card>

        {groups.now.length > 0 && (
          <section aria-labelledby="calendar-now">
            <h2 id="calendar-now" className="mb-2 text-lg font-semibold">Happening now</h2>
            <Card><CardContent className="p-0"><ul className="divide-y">{rows(groups.now)}</ul></CardContent></Card>
          </section>
        )}
        <section aria-labelledby="calendar-upcoming">
          <h2 id="calendar-upcoming" className="mb-2 text-lg font-semibold">Coming up</h2>
          {groups.upcoming.length === 0
            ? <Notice>Nothing coming up.</Notice>
            : <Card><CardContent className="p-0"><ul className="divide-y">{rows(groups.upcoming, (entry) => startsIn(entry, today))}</ul></CardContent></Card>}
        </section>
        {groups.past.length > 0 && (
          <details>
            <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-muted-foreground">Earlier ({groups.past.length})</summary>
            <Card className="mt-2"><CardContent className="p-0"><ul className="divide-y">{rows(groups.past)}</ul></CardContent></Card>
          </details>
        )}
      </div>

      {canEdit && (
        <Card id="calendar-form" className="h-fit">
          <CardHeader>
            <CardTitle className="text-lg">{editing ? 'Edit entry' : 'Add to the calendar'}</CardTitle>
            <CardDescription>Terms fill in report card dates. Holidays show on the attendance register.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={save} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="calendar-kind">Kind</Label>
                <select id="calendar-kind" className={NATIVE_SELECT_CLASS} value={current.kind} onChange={(e) => setForm({ ...current, kind: e.target.value as CalendarKind })}>
                  {CALENDAR_KINDS.map((kind) => <option key={kind} value={kind}>{CALENDAR_KIND_LABEL[kind]}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="calendar-title">Name</Label>
                <Input id="calendar-title" required maxLength={CALENDAR_TITLE_MAX} value={current.title} placeholder={current.kind === 'term' ? 'e.g. Term 1 2026/27' : current.kind === 'holiday' ? 'e.g. Mid-term break' : current.kind === 'exam' ? 'e.g. End of term exams' : 'e.g. Sports day'} onChange={(e) => setForm({ ...current, title: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="calendar-start">First day</Label>
                  <Input id="calendar-start" type="date" required value={current.startsOn} onChange={(e) => setForm({ ...current, startsOn: e.target.value, endsOn: e.target.value > current.endsOn ? e.target.value : current.endsOn })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="calendar-end">Last day</Label>
                  <Input id="calendar-end" type="date" required value={current.endsOn} min={current.startsOn} onChange={(e) => setForm({ ...current, endsOn: e.target.value })} />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={busy || !current.title.trim()} className="min-h-11">
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : !editing && <Plus className="mr-2 h-4 w-4" />}
                  {editing ? 'Save changes' : 'Add'}
                </Button>
                {editing && <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => { setEditing(null); setForm(null); }}>Cancel</Button>}
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <DeleteConfirmationDialog
        open={removing !== null}
        onOpenChange={(open) => { if (!open) setRemoving(null); }}
        onConfirm={remove}
        isDeleting={busy}
        title={`Remove ${removing?.title ?? 'this entry'}?`}
        description="It disappears from the calendar for everyone at your school. Report cards already made keep their dates."
        confirmLabel="Remove"
      />
    </div>
  );
}
