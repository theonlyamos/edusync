'use client';

import { use, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { ArrowLeft, CalendarDays, Loader2, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DeleteConfirmationDialog } from '@/components/ui/delete-confirmation-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { useHomeworkData } from '@/components/homework/shared';
import { NATIVE_SELECT_CLASS } from '@/components/school-portal/PersonFormDialog';
import { SchoolPageHeader } from '@/components/school-portal/SchoolPortalProvider';
import { gradeLevelLabel } from '@/lib/school-registration';
import { classLabel, type SchoolClassDetail } from '@/lib/school-classes';
import type { SchoolPerson } from '@/lib/school-people.server';

const errorText = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback;

export default function SchoolClassPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = use(params);
  const router = useRouter();
  const { toast } = useToast();
  const detail = useHomeworkData<{ class: SchoolClassDetail }>(`/api/schools/current/classes/${classId}`);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState<'student' | 'teacher' | null>(null);
  const c = detail.data?.class;

  const remove = async (kind: 'students' | 'teachers', userId: string) => {
    try {
      await axios.post(`/api/schools/current/classes/${classId}/${kind}`, { remove: [userId] });
      detail.refresh();
    } catch (err) {
      toast({ title: errorText(err, 'Could not remove them.'), variant: 'destructive' });
    }
  };

  const destroy = async () => {
    setBusy(true);
    try {
      await axios.delete(`/api/schools/current/classes/${classId}`);
      toast({ title: 'Class deleted' });
      router.push(c ? `/school/classes?grade=${encodeURIComponent(c.grade)}` : '/school/classes');
    } catch (err) {
      toast({ title: errorText(err, 'Could not delete the class.'), variant: 'destructive' });
      setBusy(false);
    }
  };

  if (detail.error) {
    return (
      <div className="rounded-lg border p-6 text-sm">
        <p className="text-destructive">{detail.error}</p>
        <div className="mt-3 flex gap-2">
          <Button variant="outline" size="sm" onClick={detail.refresh}>Try again</Button>
          <Button variant="ghost" size="sm" asChild><Link href="/school/classes">All classes</Link></Button>
        </div>
      </div>
    );
  }
  if (!c) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" aria-label="Loading" /></div>;

  const label = classLabel(gradeLevelLabel(c.grade), c.name);
  const timetableHref = `/school/timetables?grade=${encodeURIComponent(c.grade)}&class=${c.id}`;

  return (
    <div>
      <Link href={`/school/classes?grade=${encodeURIComponent(c.grade)}`} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden />All classes
      </Link>
      <SchoolPageHeader
        title={label}
        description={[c.classTeacher ? `Class teacher: ${c.classTeacher.name}` : 'No class teacher yet', c.room].filter(Boolean).join(' · ')}
        actions={
          <>
            <Button variant="outline" onClick={() => setEditing(true)}><Pencil className="mr-2 h-4 w-4" />Edit</Button>
            <Button variant="outline" onClick={() => setDeleting(true)}><Trash2 className="mr-2 h-4 w-4" />Delete</Button>
          </>
        }
      />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4 text-sm">
        <p className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden />
          {c.hasTimetable ? `${label} has its own timetable.` : `${label} uses the ${gradeLevelLabel(c.grade)} timetable.`}
        </p>
        <Button size="sm" variant="outline" asChild><Link href={timetableHref}>{c.hasTimetable ? 'Open timetable' : 'Make its own timetable'}</Link></Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-lg">Students ({c.students.length})</CardTitle>
            <Button size="sm" onClick={() => setPicker('student')}><Plus className="mr-2 h-4 w-4" />Add students</Button>
          </CardHeader>
          <CardContent>
            <PeopleList
              people={c.students}
              empty="No students yet. Add students from this grade, or from another grade to move them up or down."
              onRemove={(id) => remove('students', id)}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-lg">Teachers ({c.teacherPeople.length})</CardTitle>
            <Button size="sm" variant="outline" onClick={() => setPicker('teacher')}><Plus className="mr-2 h-4 w-4" />Add</Button>
          </CardHeader>
          <CardContent>
            <PeopleList people={c.teacherPeople} empty="No subject teachers yet." onRemove={(id) => remove('teachers', id)} />
          </CardContent>
        </Card>
      </div>

      <EditClassDialog open={editing} onOpenChange={setEditing} schoolClass={c} onSaved={detail.refresh} />
      <AddPeopleDialog
        role={picker}
        onClose={() => setPicker(null)}
        schoolClass={c}
        onAdded={detail.refresh}
      />
      <DeleteConfirmationDialog
        open={deleting}
        onOpenChange={setDeleting}
        onConfirm={destroy}
        isDeleting={busy}
        title={`Delete ${label}?`}
        description={`Its ${c.students.length} students stay in ${gradeLevelLabel(c.grade)} and go back to the grade’s timetable. The class timetable is deleted, and lessons or homework set only for this class stop showing to its students.`}
        confirmLabel="Delete class"
      />
    </div>
  );
}

function PeopleList({ people, empty, onRemove }: {
  people: Array<{ userId: string; name: string; email: string; isActive: boolean }>;
  empty: string;
  onRemove: (userId: string) => void;
}) {
  if (people.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="divide-y">
      {people.map((p) => (
        <li key={p.userId} className="flex items-center justify-between gap-3 py-2">
          <div className="min-w-0">
            <p className="truncate font-medium">{p.name}{!p.isActive && <span className="ml-2 text-xs font-normal text-muted-foreground">(archived)</span>}</p>
            <p className="truncate text-xs text-muted-foreground">{p.email}</p>
          </div>
          <Button size="icon" variant="ghost" aria-label={`Remove ${p.name}`} onClick={() => onRemove(p.userId)}><X className="h-4 w-4" /></Button>
        </li>
      ))}
    </ul>
  );
}

function EditClassDialog({ open, onOpenChange, schoolClass, onSaved }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolClass: SchoolClassDetail;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const teachers = useHomeworkData<{ people: SchoolPerson[] }>('/api/schools/current/people?role=teacher');
  const [name, setName] = useState(schoolClass.name);
  const [room, setRoom] = useState(schoolClass.room ?? '');
  const [teacherId, setTeacherId] = useState(schoolClass.classTeacher?.userId ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(schoolClass.name);
    setRoom(schoolClass.room ?? '');
    setTeacherId(schoolClass.classTeacher?.userId ?? '');
    setError(null);
  }, [open, schoolClass]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await axios.patch(`/api/schools/current/classes/${schoolClass.id}`, { name, room, classTeacherId: teacherId || null });
      toast({ title: 'Class saved' });
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError(errorText(err, 'Could not save the class.'));
    } finally {
      setSaving(false);
    }
  };

  const active = (teachers.data?.people ?? []).filter((p) => p.isActive || p.userId === teacherId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit class</DialogTitle>
          <DialogDescription>To move the class to another grade, add a new class there instead.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-class-name">Name</Label>
            <Input id="edit-class-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required autoComplete="off" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-class-room">Room <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input id="edit-class-room" value={room} onChange={(e) => setRoom(e.target.value)} maxLength={60} autoComplete="off" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-class-teacher">Class teacher</Label>
            <select id="edit-class-teacher" className={NATIVE_SELECT_CLASS} value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
              <option value="">None</option>
              {active.map((t) => <option key={t.userId} value={t.userId}>{t.name}</option>)}
            </select>
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving || !name.trim()}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddPeopleDialog({ role, onClose, schoolClass, onAdded }: {
  role: 'student' | 'teacher' | null;
  onClose: () => void;
  schoolClass: SchoolClassDetail;
  onAdded: () => void;
}) {
  const { toast } = useToast();
  const people = useHomeworkData<{ people: SchoolPerson[] }>(`/api/schools/current/people?role=${role ?? 'student'}`);
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'grade' | 'all'>('grade');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!role) return;
    setQuery('');
    setScope('grade');
    setPicked(new Set());
  }, [role]);

  const already = useMemo(
    () => new Set((role === 'teacher' ? schoolClass.teacherPeople : schoolClass.students).map((p) => p.userId)),
    [role, schoolClass],
  );
  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (people.data?.people ?? [])
      .filter((p) => p.isActive && !already.has(p.userId))
      .filter((p) => role !== 'student' || scope === 'all' || p.gradeLevel === schoolClass.grade)
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [people.data, already, role, scope, query, schoolClass.grade]);

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const pickedPeople = (people.data?.people ?? []).filter((p) => picked.has(p.userId));
  const moving = role === 'student' ? pickedPeople.filter((p) => p.gradeLevel !== schoolClass.grade).length : 0;
  const leaving = role === 'student' ? pickedPeople.filter((p) => p.schoolClass && p.schoolClass.id !== schoolClass.id).length : 0;

  const submit = async () => {
    setSaving(true);
    try {
      const kind = role === 'teacher' ? 'teachers' : 'students';
      await axios.post(`/api/schools/current/classes/${schoolClass.id}/${kind}`, { add: [...picked] });
      toast({ title: `Added ${picked.size} ${role === 'teacher' ? (picked.size === 1 ? 'teacher' : 'teachers') : picked.size === 1 ? 'student' : 'students'}` });
      onAdded();
      onClose();
    } catch (err) {
      toast({ title: errorText(err, 'Could not add them.'), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const gradeName = gradeLevelLabel(schoolClass.grade);

  return (
    <Dialog open={role !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{role === 'teacher' ? 'Add teachers' : 'Add students'}</DialogTitle>
          <DialogDescription>
            {role === 'teacher'
              ? 'Subject teachers for this class. They see its students and can set it lessons and homework.'
              : 'A student is in one class at a time. Adding them here takes them out of their old class.'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
            <Input aria-label="Search" placeholder="Search by name or email" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-8" />
          </div>
          {role === 'student' && (
            <select aria-label="Which students" className={`${NATIVE_SELECT_CLASS} w-auto`} value={scope} onChange={(e) => setScope(e.target.value as 'grade' | 'all')}>
              <option value="grade">In {gradeName}</option>
              <option value="all">All grades</option>
            </select>
          )}
        </div>
        <div className="max-h-72 overflow-y-auto rounded-md border">
          {!people.data ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" aria-label="Loading" /></div>
          ) : candidates.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No one left to add{query ? ' who matches' : ''}.</p>
          ) : (
            <ul className="divide-y">
              {candidates.map((p) => (
                <li key={p.userId}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/40">
                    <Checkbox checked={picked.has(p.userId)} onCheckedChange={() => toggle(p.userId)} aria-label={p.name} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{p.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {role === 'student'
                          ? [p.gradeLevel ? gradeLevelLabel(p.gradeLevel) : 'No grade', p.schoolClass ? `in ${classLabel(gradeLevelLabel(p.gradeLevel ?? ''), p.schoolClass.name)}` : 'no class'].join(' · ')
                          : p.email}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
        {(moving > 0 || leaving > 0) && (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            {[moving > 0 ? `${moving} will move to ${gradeName}` : null, leaving > 0 ? `${leaving} will leave their current class` : null].filter(Boolean).join('; ')}.
          </p>
        )}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving || picked.size === 0}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : `Add ${picked.size || ''}`.trim()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
