'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import axios from 'axios';
import { ArrowUpCircle, BookOpen, GraduationCap, Loader2, Settings, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { useHomeworkData } from '@/components/homework/shared';
import { NATIVE_SELECT_CLASS } from '@/components/school-portal/PersonFormDialog';
import { SchoolPageHeader, useSchoolPortal } from '@/components/school-portal/SchoolPortalProvider';
import { gradeLevelLabel } from '@/lib/school-registration';
import { defaultPromotionPlan, sortGrades, type PromotionPlan } from '@/lib/school-grades';
import type { GradeSummary } from '@/lib/school-grades.server';

type PromotionOutcome = { moved: number; graduated: number; unchanged: number };

const count = (n: number, one: string, many: string) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

export default function SchoolGradesPage() {
  const { school } = useSchoolPortal();
  const grades = useHomeworkData<{ grades: GradeSummary[] }>('/api/schools/current/grades');
  const [promoteOpen, setPromoteOpen] = useState(false);
  const list = grades.data?.grades ?? [];
  const totalStudents = list.reduce((sum, g) => sum + g.students, 0);

  return (
    <div>
      <SchoolPageHeader
        title="Grades"
        description="Who is in each grade, who teaches it, and the end-of-year move up."
        actions={
          <>
            <Button asChild variant="outline"><Link href="/school/settings"><Settings className="mr-2 h-4 w-4" />Change grades</Link></Button>
            <Button onClick={() => setPromoteOpen(true)} disabled={!grades.data || totalStudents === 0 || school.gradeLevels.length === 0}>
              <ArrowUpCircle className="mr-2 h-4 w-4" />Move students up
            </Button>
          </>
        }
      />

      {grades.error ? (
        <div className="rounded-lg border p-6 text-sm">
          <p className="text-destructive">{grades.error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={grades.refresh}>Try again</Button>
        </div>
      ) : grades.loading && !grades.data ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" aria-label="Loading" /></div>
      ) : list.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="font-medium">Your school has no grades yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">Choose the grades you teach in Settings, then add students to them.</p>
          <Button asChild className="mt-4"><Link href="/school/settings">Choose grades</Link></Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((g) => (
            <Card key={g.grade} className="min-w-0">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between gap-2 text-lg">
                  <span>{gradeLevelLabel(g.grade)}</span>
                  {!g.inSchoolList && (
                    <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-normal text-amber-700 dark:text-amber-300">
                      Not in your grade list
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <Link href={`/school/students?grade=${encodeURIComponent(g.grade)}`} className="flex items-center gap-2 hover:underline">
                  <GraduationCap className="h-4 w-4 text-muted-foreground" aria-hidden />
                  {count(g.students, 'student', 'students')}
                </Link>
                <Link href={`/school/lessons?grade=${encodeURIComponent(g.grade)}`} className="flex items-center gap-2 hover:underline">
                  <BookOpen className="h-4 w-4 text-muted-foreground" aria-hidden />
                  {count(g.publishedLessons, 'published lesson', 'published lessons')}
                </Link>
                <div className="flex items-start gap-2">
                  <Users className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  {g.teachers.length === 0 ? (
                    <span className="text-muted-foreground">
                      No teacher yet. <Link className="underline" href="/school/teachers">Set what teachers teach</Link>.
                    </span>
                  ) : (
                    <span className="min-w-0 break-words">{g.teachers.map((t) => t.name).join(', ')}</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <PromoteDialog
        open={promoteOpen}
        onOpenChange={setPromoteOpen}
        schoolGrades={school.gradeLevels}
        summary={list}
        onDone={grades.refresh}
      />
    </div>
  );
}

function PromoteDialog({
  open,
  onOpenChange,
  schoolGrades,
  summary,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolGrades: string[];
  summary: GradeSummary[];
  onDone: () => void;
}) {
  const { toast } = useToast();
  const ordered = useMemo(() => sortGrades(schoolGrades), [schoolGrades]);
  const [plan, setPlan] = useState<PromotionPlan>({});
  const [confirmed, setConfirmed] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PromotionOutcome | null>(null);

  useEffect(() => {
    if (!open) return;
    setPlan(defaultPromotionPlan(schoolGrades));
    setConfirmed(false);
    setError(null);
    setResult(null);
  }, [open, schoolGrades]);

  const studentsIn = (grade: string) => summary.find((g) => g.grade === grade)?.students ?? 0;
  const moving = ordered.reduce((sum, g) => sum + (plan[g] && plan[g] !== 'keep' && plan[g] !== 'graduate' && plan[g] !== g ? studentsIn(g) : 0), 0);
  const graduating = ordered.reduce((sum, g) => sum + (plan[g] === 'graduate' ? studentsIn(g) : 0), 0);
  const outsideList = summary.filter((g) => !g.inSchoolList && g.students > 0);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const { data } = await axios.post('/api/schools/current/grades/promote', { plan });
      setResult(data);
      onDone();
      toast({ title: 'Students moved up' });
    } catch (err) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Could not move students. Please try again.');
      onDone();
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!running) onOpenChange(next); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Move students up a grade</DialogTitle>
          <DialogDescription>
            Run this once at the end of the school year. Choose where each grade goes next.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4 text-sm">
            <p>
              Done. {count(result.moved, 'student', 'students')} moved up
              {result.graduated > 0 && <>, {count(result.graduated, 'student', 'students')} graduated and were deactivated</>}
              {result.unchanged > 0 && <>, {count(result.unchanged, 'student', 'students')} stayed where they were</>}.
            </p>
            {result.graduated > 0 && (
              <p className="text-muted-foreground">
                Graduates can no longer sign in to the school. You can reactivate anyone from the Students page.
              </p>
            )}
            <DialogFooter><Button onClick={() => onOpenChange(false)}>Done</Button></DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <ul className="space-y-3">
              {ordered.map((grade) => (
                <li key={grade} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] items-center gap-3">
                  <Label htmlFor={`promote-${grade}`} className="text-sm">
                    {gradeLevelLabel(grade)}
                    <span className="block text-xs font-normal text-muted-foreground">{count(studentsIn(grade), 'student', 'students')}</span>
                  </Label>
                  <select
                    id={`promote-${grade}`}
                    className={NATIVE_SELECT_CLASS}
                    value={plan[grade] ?? 'keep'}
                    onChange={(e) => setPlan((p) => ({ ...p, [grade]: e.target.value }))}
                    disabled={running}
                  >
                    {ordered.filter((g) => g !== grade).map((g) => <option key={g} value={g}>Move to {gradeLevelLabel(g)}</option>)}
                    <option value="graduate">Graduate (deactivate accounts)</option>
                    <option value="keep">Stay in {gradeLevelLabel(grade)}</option>
                  </select>
                </li>
              ))}
            </ul>

            {outsideList.length > 0 && (
              <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
                Students in grades you no longer teach ({outsideList.map((g) => gradeLevelLabel(g.grade)).join(', ')}) stay where they are.
                Move them on the Students page.
              </p>
            )}

            <div className="rounded-md border p-3 text-sm">
              <p>
                <strong>{count(moving, 'student', 'students')}</strong> will move to a new grade
                {graduating > 0 && <> and <strong>{count(graduating, 'student', 'students')}</strong> will graduate</>}.
              </p>
              {graduating > 0 && (
                <label className="mt-3 flex items-start gap-2">
                  <Checkbox checked={confirmed} onCheckedChange={(on) => setConfirmed(on === true)} disabled={running} className="mt-0.5" />
                  <span>I understand graduating students lose access to the school until someone reactivates them.</span>
                </label>
              )}
            </div>

            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={running}>Cancel</Button>
              <Button onClick={run} disabled={running || moving + graduating === 0 || (graduating > 0 && !confirmed)}>
                {running ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Moving students…</> : 'Move students'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
