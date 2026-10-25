'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import axios from 'axios';
import { CalendarDays, DoorOpen, GraduationCap, Loader2, Plus, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { useHomeworkData } from '@/components/homework/shared';
import { NATIVE_SELECT_CLASS } from '@/components/school-portal/PersonFormDialog';
import { SchoolPageHeader, useSchoolPortal } from '@/components/school-portal/SchoolPortalProvider';
import { gradeLevelLabel } from '@/lib/school-registration';
import { sortGrades } from '@/lib/school-grades';
import { classLabel, parseClassNames, type SchoolClassSummary } from '@/lib/school-classes';
import type { SchoolPerson } from '@/lib/school-people.server';

const errorText = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback;

function ClassesPage() {
  const params = useSearchParams();
  const { school } = useSchoolPortal();
  const classes = useHomeworkData<{ classes: SchoolClassSummary[] }>('/api/schools/current/classes');
  const [grade, setGrade] = useState(params.get('grade') ?? 'all');
  const [adding, setAdding] = useState(false);
  const grades = useMemo(() => sortGrades(school.gradeLevels), [school.gradeLevels]);
  const list = classes.data?.classes ?? [];
  const shownGrades = grade === 'all' ? grades : [grade];

  return (
    <div>
      <SchoolPageHeader
        title="Classes"
        description="Split each grade into classes, give each one its students, teachers and timetable."
        actions={
          <>
            <select aria-label="Grade" className={`${NATIVE_SELECT_CLASS} w-auto`} value={grade} onChange={(e) => setGrade(e.target.value)}>
              <option value="all">All grades</option>
              {grades.map((g) => <option key={g} value={g}>{gradeLevelLabel(g)}</option>)}
            </select>
            <Button onClick={() => setAdding(true)} disabled={grades.length === 0}><Plus className="mr-2 h-4 w-4" />Add classes</Button>
          </>
        }
      />

      {classes.error ? (
        <div className="rounded-lg border p-6 text-sm">
          <p className="text-destructive">{classes.error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={classes.refresh}>Try again</Button>
        </div>
      ) : !classes.data ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" aria-label="Loading" /></div>
      ) : grades.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm">
          <p className="font-medium">Choose your school’s grades first.</p>
          <Button asChild className="mt-4"><Link href="/school/settings">Choose grades</Link></Button>
        </div>
      ) : (
        <div className="space-y-8">
          {shownGrades.map((g) => {
            const inGrade = list.filter((c) => c.grade === g);
            return (
              <section key={g} aria-labelledby={`grade-${g}`}>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 id={`grade-${g}`} className="text-lg font-semibold">{gradeLevelLabel(g)}</h2>
                  <Link href={`/school/students?grade=${encodeURIComponent(g)}`} className="text-sm text-muted-foreground hover:underline">Students in this grade</Link>
                </div>
                {inGrade.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    No classes yet. Everyone in {gradeLevelLabel(g)} shares the grade’s lessons and timetable.
                  </p>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {inGrade.map((c) => <ClassCard key={c.id} c={c} />)}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      <AddClassesDialog
        open={adding}
        onOpenChange={setAdding}
        grades={grades}
        defaultGrade={grade !== 'all' ? grade : grades[0] ?? ''}
        onAdded={classes.refresh}
      />
    </div>
  );
}

function ClassCard({ c }: { c: SchoolClassSummary }) {
  return (
    <Link href={`/school/classes/${c.id}`} className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Card className="h-full transition-colors hover:bg-muted/40">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">{classLabel(gradeLevelLabel(c.grade), c.name)}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="flex items-center gap-2"><GraduationCap className="h-4 w-4 text-muted-foreground" aria-hidden />{c.studentCount} {c.studentCount === 1 ? 'student' : 'students'}</p>
          <p className="flex items-center gap-2"><UserRound className="h-4 w-4 text-muted-foreground" aria-hidden />{c.classTeacher ? `Class teacher: ${c.classTeacher.name}` : <span className="text-muted-foreground">No class teacher</span>}</p>
          {c.room && <p className="flex items-center gap-2"><DoorOpen className="h-4 w-4 text-muted-foreground" aria-hidden />{c.room}</p>}
          <p className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden />{c.hasTimetable ? 'Own timetable' : <span className="text-muted-foreground">Uses the grade’s timetable</span>}</p>
        </CardContent>
      </Card>
    </Link>
  );
}

function AddClassesDialog({ open, onOpenChange, grades, defaultGrade, onAdded }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  grades: string[];
  defaultGrade: string;
  onAdded: () => void;
}) {
  const { toast } = useToast();
  const teachers = useHomeworkData<{ people: SchoolPerson[] }>('/api/schools/current/people?role=teacher');
  const [grade, setGrade] = useState(defaultGrade);
  const [names, setNames] = useState('');
  const [room, setRoom] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setGrade(defaultGrade);
    setNames('');
    setRoom('');
    setTeacherId('');
    setError(null);
  }, [open, defaultGrade]);

  const parsed = parseClassNames(names);
  const single = parsed.ok && parsed.names.length === 1;
  const activeTeachers = (teachers.data?.people ?? []).filter((p) => p.isActive);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await axios.post('/api/schools/current/classes', { grade, names, room: single ? room : undefined, classTeacherId: single ? teacherId || null : null });
      toast({ title: parsed.ok && parsed.names.length > 1 ? `Added ${parsed.names.length} classes` : 'Class added' });
      onAdded();
      onOpenChange(false);
    } catch (err) {
      setError(errorText(err, 'Could not add the class.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add classes</DialogTitle>
          <DialogDescription>Type one name, or several separated by commas, such as “A, B, C”.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="class-grade">Grade</Label>
            <select id="class-grade" className={NATIVE_SELECT_CLASS} value={grade} onChange={(e) => setGrade(e.target.value)} required>
              {grades.map((g) => <option key={g} value={g}>{gradeLevelLabel(g)}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="class-names">Class names</Label>
            <Input id="class-names" value={names} onChange={(e) => setNames(e.target.value)} placeholder="A, B, C" required autoComplete="off" />
            {names.trim() && parsed.ok && grade && (
              <p className="text-xs text-muted-foreground">Adds {parsed.names.map((n) => classLabel(gradeLevelLabel(grade), n)).join(', ')}.</p>
            )}
          </div>
          {single && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="class-room">Room <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Input id="class-room" value={room} onChange={(e) => setRoom(e.target.value)} maxLength={60} autoComplete="off" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="class-teacher">Class teacher <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <select id="class-teacher" className={NATIVE_SELECT_CLASS} value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
                  <option value="">None yet</option>
                  {activeTeachers.map((t) => <option key={t.userId} value={t.userId}>{t.name}</option>)}
                </select>
              </div>
            </>
          )}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving || !parsed.ok || !grade}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : parsed.ok && parsed.names.length > 1 ? `Add ${parsed.names.length} classes` : 'Add class'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function SchoolClassesPage() {
  return (
    <Suspense fallback={null}>
      <ClassesPage />
    </Suspense>
  );
}
