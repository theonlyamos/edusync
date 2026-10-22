'use client';

import { useContext, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MultiSelect } from '@/components/ui/multi-select';
import { useToast } from '@/components/ui/use-toast';
import { SupabaseBrowserClientContext } from '@/components/providers/SupabaseAuthProvider';
import { GRADE_LEVELS, SUBJECTS } from '@/lib/constants';
import { formatDate } from '@/lib/format-date';
import { formatGrade } from '@/lib/grade';
import { ChangePasswordCard } from '@/components/account/ChangePasswordCard';

interface TeacherProfile {
  name: string;
  email: string;
  subjects: string[];
  grades: string[];
  joinDate?: string | null;
  createdAt?: string | null;
}

export default function TeacherProfilePage() {
  const supabase = useContext(SupabaseBrowserClientContext);
  const { toast } = useToast();
  const [profile, setProfile] = useState<TeacherProfile | null>(null);
  const [loadError, setLoadError] = useState('');
  const [name, setName] = useState('');
  const [subjects, setSubjects] = useState<string[]>([]);
  const [grades, setGrades] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoadError('');
    try {
      const response = await fetch('/api/teachers/profile');
      if (!response.ok) throw new Error('Your profile could not be loaded.');
      const data: TeacherProfile = await response.json();
      setProfile(data);
      setName(data.name);
      setSubjects(data.subjects ?? []);
      setGrades((data.grades ?? []).map((g) => g.trim().toLowerCase()));
    } catch (error) {
      setLoadError((error as Error).message);
    }
  };

  useEffect(() => {
    queueMicrotask(() => void load());
  }, []);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const response = await fetch('/api/teachers/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, subjects, grades }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Your profile could not be saved.');
      // Keep the name in the sign-in session in step, so greetings use it.
      await supabase?.auth.updateUser({ data: { name: name.trim() } });
      setProfile((current) => (current ? { ...current, name: name.trim(), subjects, grades } : current));
      toast({ title: 'Profile saved' });
    } catch (error) {
      toast({ title: 'Could not save', description: (error as Error).message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const subjectOptions = [...new Set([...SUBJECTS, ...subjects])].map((s) => ({ label: s, value: s }));
  const dirty = profile && (name.trim() !== profile.name || subjects.join() !== profile.subjects.join() || grades.join() !== profile.grades.map((g) => g.trim().toLowerCase()).join());

  return (
    <DashboardLayout>
      <div className="max-w-3xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Profile</h1>
          <p className="text-muted-foreground">Your details and sign-in settings.</p>
        </div>

        {loadError ? (
          <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-6">
            <p className="text-sm text-destructive">{loadError}</p>
            <Button variant="outline" onClick={() => void load()}>Try again</Button>
          </div>
        ) : !profile ? (
          <div className="flex justify-center py-12" role="status" aria-label="Loading profile">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Your details</CardTitle>
                <CardDescription>
                  {profile.email}
                  {profile.joinDate || profile.createdAt ? ` · Joined ${formatDate(profile.joinDate || profile.createdAt)}` : ''}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form className="space-y-5" onSubmit={saveProfile}>
                  <div className="space-y-2">
                    <Label htmlFor="profile-name">Name</Label>
                    <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Subjects you teach</Label>
                    <MultiSelect options={subjectOptions} selected={subjects} onChange={setSubjects} placeholder="Choose subjects…" />
                  </div>
                  <div className="space-y-2">
                    <Label>Grades you teach</Label>
                    <MultiSelect
                      options={GRADE_LEVELS.map((g) => ({ label: formatGrade(g), value: g }))}
                      selected={grades}
                      onChange={setGrades}
                      placeholder="Choose grades…"
                    />
                    <p className="text-xs text-muted-foreground">New lessons offer these grades first.</p>
                  </div>
                  <Button type="submit" disabled={saving || !dirty || !name.trim()}>
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save details
                  </Button>
                </form>
              </CardContent>
            </Card>

            <ChangePasswordCard />
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
