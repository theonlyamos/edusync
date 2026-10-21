'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import axios from 'axios';
import { CheckCircle2, Circle, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { GradeLevelPicker } from '@/components/school/GradeLevelPicker';
import type { SchoolSetupStep } from '@/lib/school-registration';

type CurrentSchool = {
  school: {
    id: string;
    name: string;
    country: string | null;
    timezone: string | null;
    gradeLevels: string[];
    setupDismissedAt: string | null;
  };
  role: string;
  setup: { steps: SchoolSetupStep[]; teacherCount: number; studentCount: number };
};

type Props = {
  /** Called after a save, so the page can refresh the school name and tabs. */
  onChanged?: () => void;
};

function StepIcon({ done }: { done: boolean }) {
  return done
    ? <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" aria-label="Done" />
    : <Circle className="h-5 w-5 text-muted-foreground shrink-0" aria-label="Not done" />;
}

function errorMessage(error: unknown, fallback: string) {
  return (error as any)?.response?.data?.error ?? fallback;
}

export function SchoolSetupChecklist({ onChanged }: Props) {
  const [data, setData] = useState<CurrentSchool | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [country, setCountry] = useState('');
  const [timezone, setTimezone] = useState('');
  const [gradeLevels, setGradeLevels] = useState<string[]>([]);

  const load = async () => {
    try {
      const { data: body } = await axios.get('/api/schools/current');
      if (!body.setup) {
        setData(null);
        return;
      }
      setData(body);
      setCountry(body.school.country ?? '');
      setTimezone(body.school.timezone ?? '');
      setGradeLevels(body.school.gradeLevels ?? []);
    } catch (err) {
      setError(errorMessage(err, 'Could not load your school setup.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const save = async (key: string, update: Record<string, unknown>) => {
    setSaving(key);
    setError(null);
    try {
      await axios.patch('/api/schools/current', update);
      await load();
      onChanged?.();
    } catch (err) {
      setError(errorMessage(err, 'Could not save. Please try again.'));
    } finally {
      setSaving(null);
    }
  };

  const steps = data?.setup.steps ?? [];
  const doneCount = steps.filter((s) => s.done).length;
  const byId = useMemo(() => Object.fromEntries(steps.map((s) => [s.id, s])), [steps]);

  if (loading) {
    return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  if (!data) {
    return (
      <Card><CardContent className="p-6 text-sm text-muted-foreground">
        {error ?? 'Only the school owner and school admins can see the setup steps.'}
      </CardContent></Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Set up {data.school.name}</CardTitle>
            <CardDescription>{doneCount} of {steps.length} steps done</CardDescription>
          </div>
          {data.school.setupDismissedAt ? (
            <Button variant="ghost" size="sm" onClick={() => save('dismiss', { setupDismissed: false })} disabled={saving !== null}>
              Show on school home
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => save('dismiss', { setupDismissed: true })} disabled={saving !== null}>
              Hide checklist
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        <section className="flex gap-3">
          <StepIcon done={Boolean(byId.details?.done)} />
          <div className="flex-1 space-y-3">
            <h3 className="font-medium">{byId.details?.title}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="setup-country">Country</Label>
                <Input id="setup-country" value={country} maxLength={80} onChange={(e) => setCountry(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="setup-timezone">Time zone</Label>
                <Input id="setup-timezone" value={timezone} maxLength={64} placeholder="e.g. Africa/Accra" onChange={(e) => setTimezone(e.target.value)} />
              </div>
            </div>
            <Button size="sm" onClick={() => save('details', { country, timezone })} disabled={saving !== null}>
              {saving === 'details' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save details'}
            </Button>
          </div>
        </section>

        <section className="flex gap-3">
          <StepIcon done={Boolean(byId.grades?.done)} />
          <div className="flex-1 space-y-3">
            <h3 className="font-medium">{byId.grades?.title}</h3>
            <GradeLevelPicker value={gradeLevels} onChange={setGradeLevels} disabled={saving !== null} />
            <Button size="sm" onClick={() => save('grades', { gradeLevels })} disabled={saving !== null}>
              {saving === 'grades' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save grades'}
            </Button>
          </div>
        </section>

        <section className="flex gap-3">
          <StepIcon done={Boolean(byId.people?.done)} />
          <div className="flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-medium">{byId.people?.title}</h3>
              <Badge variant="secondary">Coming soon</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {data.setup.teacherCount} teachers and {data.setup.studentCount} students so far.
              Email invites, CSV import and class join codes are on the way.
            </p>
          </div>
        </section>

        <section className="flex gap-3">
          <StepIcon done={Boolean(byId.credits?.done)} />
          <div className="flex-1 space-y-2">
            <h3 className="font-medium">{byId.credits?.title}</h3>
            <p className="text-sm text-muted-foreground">1 credit is 1 minute of live AI tutoring.</p>
            <Button asChild size="sm" variant="outline"><Link href="/learn/credits">Buy credits</Link></Button>
          </div>
        </section>
      </CardContent>
    </Card>
  );
}
