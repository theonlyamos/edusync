'use client';

import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useHomeworkData } from '@/components/homework/shared';
import { NATIVE_SELECT_CLASS } from '@/components/school-portal/PersonFormDialog';
import { gradeLevelLabel } from '@/lib/school-registration';
import type { RecordsClass } from '@/lib/school-records';

export type RecordsClasses = { classes: RecordsClass[]; today: string; manager: boolean };

export const useRecordsClasses = () => useHomeworkData<RecordsClasses>('/api/records/classes');

export const classTitle = (c: Pick<RecordsClass, 'grade' | 'name'>) => `${gradeLevelLabel(c.grade)} ${c.name}`;

export function Loading() {
  return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" aria-label="Loading" /></div>;
}

export function LoadError({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="space-y-3 py-12 text-center">
      <p role="alert" className="text-muted-foreground">{message}</p>
      <Button variant="outline" onClick={retry}>Try again</Button>
    </div>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">{children}</CardContent></Card>;
}

export function ClassSelect({ classes, value, onChange }: { classes: RecordsClass[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="records-class">Class</Label>
      <select id="records-class" className={NATIVE_SELECT_CLASS} value={value} onChange={(e) => onChange(e.target.value)}>
        {classes.map((c) => <option key={c.id} value={c.id}>{classTitle(c)} ({c.studentCount})</option>)}
      </select>
    </div>
  );
}

/**
 * Loads the classes the person keeps records for and hands the picked one to
 * `children`. Explains what to do when there are none.
 */
export function WithClasses({ children }: { children: (data: RecordsClasses) => ReactNode }) {
  const classes = useRecordsClasses();
  if (classes.loading && !classes.data) return <Loading />;
  if (/not in a school/i.test(classes.error)) return <Notice>These records belong to a school. Your account isn’t part of one yet.</Notice>;
  if (classes.error || !classes.data) return <LoadError message={classes.error || 'Could not load your classes.'} retry={() => void classes.refresh()} />;
  if (classes.data.classes.length === 0) {
    return (
      <Notice>
        {classes.data.manager
          ? 'Your school has no classes yet. Add classes and put students in them first.'
          : 'You aren’t assigned to a class yet. Ask your school administrator to add you to the classes you teach.'}
      </Notice>
    );
  }
  return <>{children(classes.data)}</>;
}
