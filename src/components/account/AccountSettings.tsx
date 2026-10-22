'use client';

import { useContext, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { SupabaseBrowserClientContext } from '@/components/providers/SupabaseAuthProvider';
import { formatDate } from '@/lib/format-date';
import { formatGrade } from '@/lib/grade';
import { ChangePasswordCard } from './ChangePasswordCard';

interface Account {
  name: string;
  email: string;
  role: string | null;
  createdAt: string | null;
  grade: string | null;
  school: { name: string; role: string } | null;
}

const SCHOOL_ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  admin: 'School admin',
  teacher: 'Teacher',
  student: 'Student',
};

/** Name, school details and password for students and admins. Teachers use their own profile page. */
export function AccountSettings() {
  const supabase = useContext(SupabaseBrowserClientContext);
  const { toast } = useToast();
  const [account, setAccount] = useState<Account | null>(null);
  const [loadError, setLoadError] = useState('');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoadError('');
    try {
      const response = await fetch('/api/account');
      if (!response.ok) throw new Error('Your account could not be loaded.');
      const data: Account = await response.json();
      setAccount(data);
      setName(data.name);
    } catch (error) {
      setLoadError((error as Error).message);
    }
  };

  useEffect(() => {
    queueMicrotask(() => void load());
  }, []);

  const saveName = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const response = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Your name could not be saved.');
      // Keep the name in the sign-in session in step, so greetings use it.
      await supabase?.auth.updateUser({ data: { name: name.trim() } });
      setAccount((current) => (current ? { ...current, name: name.trim() } : current));
      toast({ title: 'Name saved' });
    } catch (error) {
      toast({ title: 'Could not save', description: (error as Error).message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const dirty = account && name.trim() !== account.name;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Your details and sign-in settings.</p>
      </div>

      {loadError ? (
        <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-6">
          <p className="text-sm text-destructive">{loadError}</p>
          <Button variant="outline" onClick={() => void load()}>Try again</Button>
        </div>
      ) : !account ? (
        <div className="flex justify-center py-12" role="status" aria-label="Loading settings">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Your details</CardTitle>
              <CardDescription>
                {account.email}
                {account.createdAt ? ` · Joined ${formatDate(account.createdAt)}` : ''}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <form className="space-y-5" onSubmit={saveName}>
                <div className="space-y-2">
                  <Label htmlFor="account-name">Name</Label>
                  <Input id="account-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required />
                </div>
                <Button type="submit" disabled={saving || !dirty || !name.trim()}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save name
                </Button>
              </form>
              {(account.school || account.grade) && (
                <dl className="grid gap-4 border-t pt-5 text-sm sm:grid-cols-2">
                  {account.school && (
                    <div>
                      <dt className="text-muted-foreground">School</dt>
                      <dd className="font-medium">
                        {account.school.name}
                        <span className="font-normal text-muted-foreground"> · {SCHOOL_ROLE_LABELS[account.school.role] ?? account.school.role}</span>
                      </dd>
                    </div>
                  )}
                  {account.grade && (
                    <div>
                      <dt className="text-muted-foreground">Grade</dt>
                      <dd className="font-medium">{formatGrade(account.grade)}</dd>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground sm:col-span-2">
                    {account.role === 'student' ? 'Ask your teacher if your school or grade is wrong.' : 'School details are managed on the school page.'}
                  </p>
                </dl>
              )}
            </CardContent>
          </Card>

          <ChangePasswordCard />
        </>
      )}
    </div>
  );
}
