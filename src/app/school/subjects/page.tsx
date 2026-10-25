'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import axios from 'axios';
import { Archive, ArchiveRestore, BookMarked, Loader2, MoreHorizontal, Pencil, Plus, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { useHomeworkData } from '@/components/homework/shared';
import { NATIVE_SELECT_CLASS } from '@/components/school-portal/PersonFormDialog';
import { SchoolPageHeader, useSchoolPortal } from '@/components/school-portal/SchoolPortalProvider';
import { gradeLevelLabel } from '@/lib/school-registration';
import { sortGrades } from '@/lib/school-grades';
import { classLabel, type SchoolClassSummary } from '@/lib/school-classes';
import { SUBJECT_COLORS, subjectInGrade, type SchoolSubject, type SubjectTeacherAssignment } from '@/lib/school-subjects';
import type { SchoolPerson } from '@/lib/school-people.server';
import type { TypedSubject } from '@/lib/school-subjects.server';
import { cn } from '@/lib/utils';
import { SubjectDot } from '@/components/school-portal/SubjectDot';

type SubjectRow = SchoolSubject & { lessonCount: number };

const errorText = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback;

export default function SchoolSubjectsPage() {
  const { school } = useSchoolPortal();
  const { toast } = useToast();
  const subjects = useHomeworkData<{ subjects: SubjectRow[] }>('/api/schools/current/subjects');
  const typed = useHomeworkData<{ typed: TypedSubject[] }>('/api/schools/current/subjects/typed');
  const [editing, setEditing] = useState<SubjectRow | 'new' | null>(null);
  const [deleting, setDeleting] = useState<SubjectRow | null>(null);
  const [busy, setBusy] = useState(false);
  const grades = useMemo(() => sortGrades(school.gradeLevels), [school.gradeLevels]);
  const list = subjects.data?.subjects ?? [];
  const active = list.filter((s) => !s.archived);
  const archived = list.filter((s) => s.archived);

  const refreshAll = () => { subjects.refresh(); typed.refresh(); };

  const addStandard = async () => {
    setBusy(true);
    try {
      const { data } = await axios.post('/api/schools/current/subjects', { standard: true });
      toast({ title: data.added ? `Added ${data.added} subjects` : 'You already have every standard subject' });
      refreshAll();
    } catch (err) {
      toast({ title: errorText(err, 'Could not add the subjects.'), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const setArchived = async (s: SubjectRow, value: boolean) => {
    try {
      await axios.patch(`/api/schools/current/subjects/${s.id}`, { archived: value });
      toast({ title: value ? `${s.name} archived` : `${s.name} restored` });
      refreshAll();
    } catch (err) {
      toast({ title: errorText(err, 'Could not change the subject.'), variant: 'destructive' });
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await axios.delete(`/api/schools/current/subjects/${deleting.id}`);
      toast({ title: `${deleting.name} deleted` });
      setDeleting(null);
      refreshAll();
    } catch (err) {
      toast({ title: errorText(err, 'Could not delete the subject.'), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <SchoolPageHeader
        title="Subjects"
        description="Your school’s subjects, the grades that take them, and who teaches each one."
        actions={
          <>
            <Button variant="outline" onClick={addStandard} disabled={busy || !subjects.data}><Sparkles className="mr-2 h-4 w-4" />Add standard subjects</Button>
            <Button onClick={() => setEditing('new')}><Plus className="mr-2 h-4 w-4" />Add subject</Button>
          </>
        }
      />

      {subjects.error ? (
        <div className="rounded-lg border p-6 text-sm">
          <p className="text-destructive">{subjects.error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={subjects.refresh}>Try again</Button>
        </div>
      ) : !subjects.data ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" aria-label="Loading" /></div>
      ) : (
        <div className="space-y-6">
          {active.length === 0 ? (
            <div className="rounded-lg border border-dashed p-10 text-center">
              <BookMarked className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
              <p className="mt-3 font-medium">No subjects yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Start from the standard GES list for basic schools and change it to fit, or add your own.</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Button onClick={addStandard} disabled={busy}><Sparkles className="mr-2 h-4 w-4" />Add standard subjects</Button>
                <Button variant="outline" onClick={() => setEditing('new')}>Add one</Button>
              </div>
            </div>
          ) : (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Subject list</CardTitle>
                <CardDescription>Teachers pick from this list for lessons and timetables.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <ul className="divide-y">
                  {active.map((s) => (
                    <SubjectItem key={s.id} s={s} onEdit={() => setEditing(s)} onArchive={() => setArchived(s, true)} onDelete={() => setDeleting(s)} />
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {(typed.data?.typed.length ?? 0) > 0 && active.length > 0 && (
            <TypedSubjects typed={typed.data!.typed} subjects={active} onDone={refreshAll} />
          )}

          {active.length > 0 && <WhoTeaches subjects={active} grades={grades} />}

          {archived.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Archived</CardTitle>
                <CardDescription>Hidden from pickers. Lessons that use them keep them.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <ul className="divide-y">
                  {archived.map((s) => (
                    <li key={s.id} className="flex items-center gap-3 px-6 py-3 text-sm">
                      <SubjectDot color={s.color} />
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">{s.name}</span>
                      <Button size="sm" variant="ghost" onClick={() => setArchived(s, false)}><ArchiveRestore className="mr-2 h-4 w-4" />Restore</Button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <SubjectDialog subject={editing} grades={grades} onClose={() => setEditing(null)} onSaved={refreshAll} />
      <Dialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open) setDeleting(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleting?.name}?</DialogTitle>
            <DialogDescription>
              {deleting?.lessonCount
                ? `${deleting.lessonCount} lessons use it, so it can only be archived.`
                : 'It comes off the list and off who teaches what. Timetable slots keep the name as typed.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleting(null)} disabled={busy}>Cancel</Button>
            {deleting?.lessonCount ? (
              <Button onClick={() => { const s = deleting; setDeleting(null); void setArchived(s, true); }}>Archive instead</Button>
            ) : (
              <Button variant="destructive" onClick={remove} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete'}</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SubjectItem({ s, onEdit, onArchive, onDelete }: { s: SubjectRow; onEdit: () => void; onArchive: () => void; onDelete: () => void }) {
  return (
    <li className="flex items-center gap-3 px-6 py-3">
      <SubjectDot color={s.color} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{s.name}{s.code && <span className="ml-2 text-xs font-normal text-muted-foreground">{s.code}</span>}</p>
        <p className="truncate text-xs text-muted-foreground">
          {s.grades.length === 0 ? 'All grades' : sortGrades(s.grades).map(gradeLevelLabel).join(', ')}
          {' · '}
          {s.lessonCount === 1 ? '1 lesson' : `${s.lessonCount} lessons`}
        </p>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Actions for ${s.name}`}><MoreHorizontal className="h-4 w-4" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onEdit}><Pencil className="mr-2 h-4 w-4" />Edit</DropdownMenuItem>
          <DropdownMenuItem onSelect={onArchive}><Archive className="mr-2 h-4 w-4" />Archive</DropdownMenuItem>
          <DropdownMenuItem className="text-red-600 focus:text-red-600" onSelect={onDelete}><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

function SubjectDialog({ subject, grades, onClose, onSaved }: {
  subject: SubjectRow | 'new' | null;
  grades: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const isNew = subject === 'new';
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [color, setColor] = useState<string>(SUBJECT_COLORS[0]);
  const [picked, setPicked] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!subject) return;
    setError(null);
    if (subject === 'new') {
      setName(''); setCode(''); setColor(SUBJECT_COLORS[Math.floor(Math.random() * SUBJECT_COLORS.length)]); setPicked([]);
    } else {
      setName(subject.name); setCode(subject.code ?? ''); setColor(subject.color ?? SUBJECT_COLORS[0]); setPicked(subject.grades);
    }
  }, [subject]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const body = { name, code, color, grades: picked };
    try {
      if (isNew) await axios.post('/api/schools/current/subjects', body);
      else if (subject) await axios.patch(`/api/schools/current/subjects/${subject.id}`, body);
      toast({ title: isNew ? 'Subject added' : 'Subject saved' });
      onSaved();
      onClose();
    } catch (err) {
      setError(errorText(err, 'Could not save the subject.'));
    } finally {
      setSaving(false);
    }
  };

  const toggle = (g: string, on: boolean) => setPicked((p) => (on ? [...p, g] : p.filter((x) => x !== g)));

  return (
    <Dialog open={subject !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isNew ? 'Add subject' : 'Edit subject'}</DialogTitle>
          {!isNew && <DialogDescription>A new name also shows on homework, timetables and teachers’ subjects.</DialogDescription>}
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-[1fr_7rem] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="subject-name">Name</Label>
              <Input id="subject-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="subject-code">Short code</Label>
              <Input id="subject-code" value={code} onChange={(e) => setCode(e.target.value)} maxLength={10} placeholder="MATH" autoComplete="off" />
            </div>
          </div>
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">Colour</legend>
            <div className="flex flex-wrap gap-2">
              {SUBJECT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Colour ${c}`}
                  aria-pressed={color === c}
                  onClick={() => setColor(c)}
                  className={cn('h-7 w-7 rounded-full border-2', color === c ? 'border-foreground' : 'border-transparent')}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </fieldset>
          {grades.length > 0 && (
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">Grades that take it</legend>
              <p className="text-xs text-muted-foreground">Leave all unticked for every grade.</p>
              <div className="flex flex-wrap gap-2">
                {grades.map((g) => (
                  <label key={g} className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
                    <Checkbox checked={picked.includes(g)} onCheckedChange={(on) => toggle(g, on === true)} />
                    {gradeLevelLabel(g)}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving || !name.trim()}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : isNew ? 'Add subject' : 'Save'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TypedSubjects({ typed, subjects, onDone }: { typed: TypedSubject[]; subjects: SubjectRow[]; onDone: () => void }) {
  const { toast } = useToast();
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setChoice(Object.fromEntries(typed.map((t) => [t.text, t.suggestionId ?? ''])));
  }, [typed]);

  const chosen = typed.filter((t) => choice[t.text]);
  const save = async () => {
    setSaving(true);
    try {
      await axios.post('/api/schools/current/subjects/typed', { matches: chosen.map((t) => ({ text: t.text, subjectId: choice[t.text] })) });
      toast({ title: `Matched ${chosen.length} typed ${chosen.length === 1 ? 'subject' : 'subjects'}` });
      onDone();
    } catch (err) {
      toast({ title: errorText(err, 'Could not match them.'), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const where = (t: TypedSubject) =>
    [t.lessons && `${t.lessons} ${t.lessons === 1 ? 'lesson' : 'lessons'}`, t.timetableSlots && `${t.timetableSlots} timetable ${t.timetableSlots === 1 ? 'slot' : 'slots'}`, t.teachers && `${t.teachers} ${t.teachers === 1 ? 'teacher' : 'teachers'}`]
      .filter(Boolean)
      .join(', ');

  return (
    <Card className="border-amber-500/40">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg"><Wand2 className="h-5 w-5" aria-hidden />Tidy up typed subjects</CardTitle>
        <CardDescription>These were typed before the list existed. Match each to a listed subject so reports and timetables count them together.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="divide-y rounded-md border">
          {typed.map((t) => (
            <li key={t.text} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">“{t.text}”</p>
                <p className="text-xs text-muted-foreground">{where(t)}</p>
              </div>
              <select
                aria-label={`Match ${t.text}`}
                className={cn(NATIVE_SELECT_CLASS, 'sm:w-64')}
                value={choice[t.text] ?? ''}
                onChange={(e) => setChoice((c) => ({ ...c, [t.text]: e.target.value }))}
              >
                <option value="">Leave as typed</option>
                {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </li>
          ))}
        </ul>
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving || chosen.length === 0}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : `Match ${chosen.length || ''}`.trim()}</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function WhoTeaches({ subjects, grades }: { subjects: SubjectRow[]; grades: string[] }) {
  const { toast } = useToast();
  const assignments = useHomeworkData<{ assignments: SubjectTeacherAssignment[] }>('/api/schools/current/subjects/assignments');
  const teachers = useHomeworkData<{ people: SchoolPerson[] }>('/api/schools/current/people?role=teacher');
  const classes = useHomeworkData<{ classes: SchoolClassSummary[] }>('/api/schools/current/classes');
  const [grade, setGrade] = useState(grades[0] ?? '');
  const [saving, setSaving] = useState<string | null>(null);

  const inGrade = subjects.filter((s) => subjectInGrade(s, grade));
  const gradeClasses = (classes.data?.classes ?? []).filter((c) => c.grade === grade);
  const activeTeachers = (teachers.data?.people ?? []).filter((p) => p.isActive);
  const list = assignments.data?.assignments ?? [];
  const teacherName = (id: string) => teachers.data?.people.find((p) => p.userId === id)?.name ?? 'Unknown';

  const current = (subjectId: string, classId: string | null) =>
    list.find((a) => a.subjectId === subjectId && a.grade === grade && a.classId === classId)?.teacherId ?? '';

  const save = async (subjectId: string, classId: string | null, teacherId: string) => {
    const slot = `${subjectId}:${classId ?? 'grade'}`;
    setSaving(slot);
    try {
      await axios.put('/api/schools/current/subjects/assignments', { subjectId, grade, classId, teacherId: teacherId || null });
      assignments.refresh();
    } catch (err) {
      toast({ title: errorText(err, 'Could not save who teaches this.'), variant: 'destructive' });
    } finally {
      setSaving(null);
    }
  };

  const unassigned = inGrade.filter((s) => !current(s.id, null) && gradeClasses.every((c) => !current(s.id, c.id))).length;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 space-y-0 pb-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-lg">Who teaches what</CardTitle>
          <CardDescription>
            Pick a teacher for the whole grade, and a different one for a class only where it differs.
            {grade && unassigned > 0 && <> {unassigned} {unassigned === 1 ? 'subject has' : 'subjects have'} no teacher in {gradeLevelLabel(grade)} yet.</>}
          </CardDescription>
        </div>
        <select aria-label="Grade" className={cn(NATIVE_SELECT_CLASS, 'sm:w-44')} value={grade} onChange={(e) => setGrade(e.target.value)}>
          {grades.map((g) => <option key={g} value={g}>{gradeLevelLabel(g)}</option>)}
        </select>
      </CardHeader>
      <CardContent>
        {!assignments.data || !teachers.data || !classes.data ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" aria-label="Loading" /></div>
        ) : activeTeachers.length === 0 ? (
          <p className="text-sm text-muted-foreground">Add teachers first, on the <Link className="underline" href="/school/teachers">Teachers</Link> page.</p>
        ) : inGrade.length === 0 ? (
          <p className="text-sm text-muted-foreground">No subjects are set for {gradeLevelLabel(grade)}.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">Subject</th>
                  <th className="px-2 py-2 font-medium">Whole {gradeLevelLabel(grade)}</th>
                  {gradeClasses.map((c) => <th key={c.id} className="px-2 py-2 font-medium">{classLabel(gradeLevelLabel(grade), c.name)}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y">
                {inGrade.map((s) => {
                  const gradeTeacher = current(s.id, null);
                  return (
                    <tr key={s.id}>
                      <td className="py-2 pr-3"><span className="flex items-center gap-2"><SubjectDot color={s.color} /><span className="font-medium">{s.name}</span></span></td>
                      <td className="px-2 py-2">
                        <TeacherSelect
                          label={`${s.name} teacher for ${gradeLevelLabel(grade)}`}
                          value={gradeTeacher}
                          teachers={activeTeachers}
                          emptyLabel="No teacher"
                          busy={saving === `${s.id}:grade`}
                          onChange={(id) => save(s.id, null, id)}
                        />
                      </td>
                      {gradeClasses.map((c) => (
                        <td key={c.id} className="px-2 py-2">
                          <TeacherSelect
                            label={`${s.name} teacher for ${classLabel(gradeLevelLabel(grade), c.name)}`}
                            value={current(s.id, c.id)}
                            teachers={activeTeachers}
                            emptyLabel={gradeTeacher ? `Same (${teacherName(gradeTeacher)})` : 'No teacher'}
                            busy={saving === `${s.id}:${c.id}`}
                            onChange={(id) => save(s.id, c.id, id)}
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TeacherSelect({ label, value, teachers, emptyLabel, busy, onChange }: {
  label: string;
  value: string;
  teachers: SchoolPerson[];
  emptyLabel: string;
  busy: boolean;
  onChange: (teacherId: string) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <select aria-label={label} className={cn(NATIVE_SELECT_CLASS, 'min-w-40', !value && 'text-muted-foreground')} value={value} disabled={busy} onChange={(e) => onChange(e.target.value)}>
        <option value="">{emptyLabel}</option>
        {teachers.map((t) => <option key={t.userId} value={t.userId}>{t.name}</option>)}
      </select>
      {busy && <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-label="Saving" />}
    </div>
  );
}
