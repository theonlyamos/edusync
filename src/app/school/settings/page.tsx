'use client';

import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { GradeLevelPicker } from '@/components/school/GradeLevelPicker';
import { NATIVE_SELECT_CLASS } from '@/components/school-portal/PersonFormDialog';
import { SchoolPageHeader, useSchoolPortal } from '@/components/school-portal/SchoolPortalProvider';
import OrgApiKeysTab from '@/app/learn/org/[orgId]/components/OrgApiKeysTab';

function errorMessage(error: unknown, fallback: string) {
  return (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback;
}

function timeZones(current: string): string[] {
  let zones: string[] = [];
  try {
    zones = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
  } catch {
    zones = [];
  }
  if (current && !zones.includes(current)) zones = [current, ...zones];
  return zones;
}

export default function SchoolSettingsPage() {
  const { school, reload } = useSchoolPortal();
  const { toast } = useToast();
  const [name, setName] = useState(school.name);
  const [description, setDescription] = useState(school.description ?? '');
  const [country, setCountry] = useState(school.country ?? '');
  const [timezone, setTimezone] = useState(school.timezone ?? '');
  const [grades, setGrades] = useState<string[]>(school.gradeLevels);
  const [saving, setSaving] = useState<string | null>(null);
  const zones = useMemo(() => timeZones(school.timezone ?? ''), [school.timezone]);

  useEffect(() => {
    setName(school.name);
    setDescription(school.description ?? '');
    setCountry(school.country ?? '');
    setTimezone(school.timezone ?? '');
    setGrades(school.gradeLevels);
  }, [school]);

  const save = async (key: string, update: Record<string, unknown>, done: string) => {
    setSaving(key);
    try {
      await axios.patch('/api/schools/current', update);
      await reload();
      toast({ title: done });
    } catch (err) {
      toast({ title: 'Could not save', description: errorMessage(err, 'Please try again.'), variant: 'destructive' });
    } finally {
      setSaving(null);
    }
  };

  const removedGrades = school.gradeLevels.filter((g) => !grades.includes(g));

  return (
    <div className="space-y-6">
      <SchoolPageHeader title="School settings" description="Your school’s profile, location and the grades it teaches." />

      <Card>
        <CardHeader>
          <CardTitle>School profile</CardTitle>
          <CardDescription>Shown to your teachers and students, and in the emails we send them.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save('profile', { name, description }, 'School profile saved'); }}>
            <div className="space-y-1.5">
              <Label htmlFor="school-name">School name</Label>
              <Input id="school-name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={120} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="school-description">Description <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Textarea id="school-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={3} />
            </div>
            <Button type="submit" disabled={saving !== null}>{saving === 'profile' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save profile'}</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Location and time zone</CardTitle>
          <CardDescription>Homework deadlines, timetables and live classes use the school’s time zone.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save('location', { country, timezone }, 'Location saved'); }}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="school-country">Country</Label>
                <Input id="school-country" value={country} onChange={(e) => setCountry(e.target.value)} maxLength={80} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="school-timezone">Time zone</Label>
                {zones.length > 0 ? (
                  <select id="school-timezone" className={NATIVE_SELECT_CLASS} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                    <option value="">Not set</option>
                    {zones.map((z) => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}
                  </select>
                ) : (
                  <Input id="school-timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="e.g. Africa/Accra" maxLength={64} />
                )}
              </div>
            </div>
            <Button type="submit" disabled={saving !== null}>{saving === 'location' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save location'}</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Grades</CardTitle>
          <CardDescription>The grades your school teaches. New students must be in one of these.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <GradeLevelPicker value={grades} onChange={setGrades} disabled={saving !== null} />
          {removedGrades.length > 0 && (
            <p className="text-sm text-amber-700 dark:text-amber-300">
              Students already in a grade you remove keep it until you move them on the Students page.
            </p>
          )}
          <Button onClick={() => save('grades', { gradeLevels: grades }, 'Grades saved')} disabled={saving !== null || grades.length === 0}>
            {saving === 'grades' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save grades'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Setup checklist</CardTitle>
          <CardDescription>The getting-started steps at the top of the dashboard.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            onClick={() => save('setup', { setupDismissed: !school.setupDismissedAt }, school.setupDismissedAt ? 'Checklist is back on the dashboard' : 'Checklist hidden')}
            disabled={saving !== null}
          >
            {school.setupDismissedAt ? 'Show it on the dashboard' : 'Hide it from the dashboard'}
          </Button>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold">Tutor widget API keys</h2>
          <p className="text-sm text-muted-foreground">
            Only needed if you put the InsyteAI tutor on your own website.
          </p>
        </div>
        <OrgApiKeysTab
          organizationId={school.id}
          isOwnerOrAdmin
          onError={(message) => toast({ title: 'API keys', description: message, variant: 'destructive' })}
          onSuccess={(message) => toast({ title: message })}
        />
      </section>
    </div>
  );
}
