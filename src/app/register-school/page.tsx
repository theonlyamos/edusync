'use client';

import { useContext, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import axios from 'axios';
import { Loader2, MailCheck, School } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Logo } from '@/components/brand/Logo';
import { GradeLevelPicker } from '@/components/school/GradeLevelPicker';
import { SupabaseBrowserClientContext, SupabaseSessionContext } from '@/components/providers/SupabaseAuthProvider';

const RETURN_PATH = '/register-school';
const PENDING_KEY = 'pendingSchoolRegistration';

type Pending = { schoolName: string; country: string };

function readPending(): Pending | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw);
    return { schoolName: String(value.schoolName ?? ''), country: String(value.country ?? '') };
  } catch {
    return null;
  }
}

function savePending(value: Pending) {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(value)); } catch { /* private mode */ }
}

function clearPending() {
  try { localStorage.removeItem(PENDING_KEY); } catch { /* private mode */ }
}

function errorMessage(error: unknown, fallback: string) {
  const data = (error as any)?.response?.data;
  return data?.error ?? (error as any)?.message ?? fallback;
}

function loginReturnUrl() {
  return `${window.location.origin}/login?redirectedFrom=${encodeURIComponent(RETURN_PATH)}`;
}

function AccountStep() {
  const supabase = useContext(SupabaseBrowserClientContext);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const name = String(form.get('name') ?? '').trim();
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');
    const confirmPassword = String(form.get('confirmPassword') ?? '');
    const schoolName = String(form.get('schoolName') ?? '').trim();
    const country = String(form.get('country') ?? '').trim();

    if (password !== confirmPassword) return setError('Passwords do not match.');
    if (password.length < 6) return setError('Password must be at least 6 characters.');
    if (schoolName.length < 2) return setError('Enter your school name.');

    setBusy(true);
    savePending({ schoolName, country });
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name }, emailRedirectTo: loginReturnUrl() },
      });
      if (signUpError) throw signUpError;
      // With email confirmation on, there is no session until the link is opened.
      if (!data.session) setSentTo(email);
    } catch (err) {
      setError(errorMessage(err, 'Could not create your account.'));
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    const form = document.getElementById('register-school-form') as HTMLFormElement | null;
    if (form) {
      const data = new FormData(form);
      savePending({ schoolName: String(data.get('schoolName') ?? '').trim(), country: String(data.get('country') ?? '').trim() });
    }
    const { error: oauthError } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: loginReturnUrl() } });
    if (oauthError) setError(oauthError.message);
  };

  if (sentTo) {
    return (
      <div className="space-y-4 text-center">
        <MailCheck className="mx-auto h-10 w-10 text-primary" />
        <h2 className="text-2xl font-semibold font-display">Check your email</h2>
        <p className="text-muted-foreground">
          We sent a confirmation link to <span className="font-medium text-foreground">{sentTo}</span>.
          Open it to finish setting up your school.
        </p>
      </div>
    );
  }

  return (
    <form id="register-school-form" onSubmit={handleSubmit} className="space-y-6">
      <fieldset className="space-y-4" disabled={busy}>
        <legend className="text-sm font-medium text-muted-foreground mb-2">Your school</legend>
        <div className="space-y-2">
          <Label htmlFor="schoolName">School name</Label>
          <Input id="schoolName" name="schoolName" required minLength={2} maxLength={120} placeholder="e.g. Hilltop Academy" className="h-11 bg-transparent" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="country">Country</Label>
          <Input id="country" name="country" maxLength={80} placeholder="e.g. Ghana" className="h-11 bg-transparent" />
        </div>
      </fieldset>

      <fieldset className="space-y-4" disabled={busy}>
        <legend className="text-sm font-medium text-muted-foreground mb-2">Your account (you will be the school owner)</legend>
        <div className="space-y-2">
          <Label htmlFor="name">Full name</Label>
          <Input id="name" name="name" required className="h-11 bg-transparent" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Work email</Label>
          <Input id="email" name="email" type="email" required className="h-11 bg-transparent" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" required minLength={6} className="h-11 bg-transparent" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <Input id="confirmPassword" name="confirmPassword" type="password" required minLength={6} className="h-11 bg-transparent" />
        </div>
      </fieldset>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <Button type="submit" className="w-full h-11" disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create account and continue'}
      </Button>

      <Button type="button" variant="outline" className="w-full h-11 bg-transparent" onClick={handleGoogle} disabled={busy}>
        Continue with Google
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href={`/login?redirectedFrom=${encodeURIComponent(RETURN_PATH)}`} className="font-medium text-foreground hover:underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </form>
  );
}

function useTimeZones() {
  return useMemo(() => {
    try {
      return (Intl as any).supportedValuesOf?.('timeZone') as string[] | undefined;
    } catch {
      return undefined;
    }
  }, []);
}

function SchoolStep() {
  const timeZones = useTimeZones();
  const [loading, setLoading] = useState(true);
  const [existing, setExisting] = useState<{ id: string; name: string; role: string } | null>(null);
  const [schoolName, setSchoolName] = useState('');
  const [country, setCountry] = useState('');
  const [timezone, setTimezone] = useState('');
  const [gradeLevels, setGradeLevels] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const pending = readPending();
    if (pending) {
      setSchoolName(pending.schoolName);
      setCountry(pending.country);
    }
    try { setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone ?? ''); } catch { /* keep empty */ }

    axios.get('/api/schools/current')
      .then(({ data }) => {
        if (data.school) setExisting({ id: data.school.id, name: data.school.name, role: data.role });
      })
      .catch(() => { /* the form still works; the server checks again */ })
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { data } = await axios.post('/api/schools', { name: schoolName, country, timezone, gradeLevels });
      clearPending();
      // Full load so the app picks up the owner's updated account.
      window.location.assign(`/learn/org/${data.school.id}?tab=setup`);
    } catch (err) {
      setError(errorMessage(err, 'Could not register your school.'));
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  if (existing) {
    const canManage = existing.role === 'owner' || existing.role === 'admin';
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold font-display">You already belong to {existing.name}</h2>
        <p className="text-muted-foreground">Each account can belong to one school.</p>
        {canManage && (
          <Button asChild className="h-11"><Link href={`/learn/org/${existing.id}?tab=setup`}>Go to your school</Link></Button>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <fieldset className="space-y-4" disabled={busy}>
        <div className="space-y-2">
          <Label htmlFor="schoolName">School name</Label>
          <Input id="schoolName" value={schoolName} onChange={(e) => setSchoolName(e.target.value)} required minLength={2} maxLength={120} className="h-11 bg-transparent" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="country">Country</Label>
            <Input id="country" value={country} onChange={(e) => setCountry(e.target.value)} maxLength={80} className="h-11 bg-transparent" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="timezone">Time zone</Label>
            {timeZones ? (
              <select
                id="timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="h-11 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="">Choose a time zone</option>
                {timeZones.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            ) : (
              <Input id="timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="e.g. Africa/Accra" className="h-11 bg-transparent" />
            )}
          </div>
        </div>
        <div className="space-y-2">
          <Label>Grades you teach</Label>
          <p className="text-xs text-muted-foreground">You can change these later.</p>
          <GradeLevelPicker value={gradeLevels} onChange={setGradeLevels} disabled={busy} />
        </div>
      </fieldset>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <Button type="submit" className="w-full h-11" disabled={busy || schoolName.trim().length < 2}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Register school'}
      </Button>
    </form>
  );
}

export default function RegisterSchoolPage() {
  const session = useContext(SupabaseSessionContext);
  const signedIn = Boolean(session?.user);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="p-6">
        <Link href="/" className="inline-flex items-center gap-3"><Logo markClassName="h-8 w-8" /></Link>
      </header>
      <main className="flex-1 flex justify-center px-4 pb-16">
        <div className="w-full max-w-lg space-y-8">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
              <School className="h-4 w-4" />
              {signedIn ? 'Step 2 of 2' : 'Step 1 of 2'}
            </div>
            <h1 className="text-3xl font-bold tracking-tight font-display">Register your school</h1>
            <p className="text-muted-foreground">
              {signedIn
                ? 'Tell us about your school. You can invite teachers and students next.'
                : 'Create the owner account for your school. We will email you a link to confirm it.'}
            </p>
          </div>
          {session === undefined
            ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
            : signedIn ? <SchoolStep /> : <AccountStep />}
        </div>
      </main>
    </div>
  );
}
