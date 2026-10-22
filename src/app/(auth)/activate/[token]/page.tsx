'use client';

import { useContext, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { JoinShell } from '@/components/school/JoinShell';
import { SupabaseBrowserClientContext } from '@/components/providers/SupabaseAuthProvider';
import { MIN_PASSWORD_LENGTH, validateNewPassword } from '@/lib/password-reset';
import { homeForSchoolRole, schoolRoleLabel } from '@/lib/school-people';

type LinkInfo = {
  state: 'pending' | 'used' | 'expired' | 'cancelled' | 'invalid';
  kind?: 'activate' | 'reset';
  email?: string;
  name?: string | null;
  role?: string;
  school?: { name: string };
};

const CLOSED: Record<Exclude<LinkInfo['state'], 'pending'>, { title: string; text: string }> = {
  used: { title: 'This link was already used', text: 'Sign in with the password you chose. If you forgot it, use “Forgot password?” on the sign-in page.' },
  expired: { title: 'This link has expired', text: 'Ask your school to send you a new one.' },
  cancelled: { title: 'This link no longer works', text: 'Your school sent a newer link, or turned this account off. Use the newest email from your school.' },
  invalid: { title: 'This link isn’t valid', text: 'Check that you opened the whole link from your email.' },
};

/** Where a person activates the account their school made, or sets a new password their school sent. */
export default function ActivateAccountPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = useContext(SupabaseBrowserClientContext);
  const token = String(params?.token ?? '');
  const [info, setInfo] = useState<LinkInfo | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/activate/${encodeURIComponent(token)}`)
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!live) return;
        if (res.status === 404 || !body?.state) setInfo({ state: 'invalid' });
        else if (!res.ok) setError(body?.error ?? 'Could not check this link.');
        else setInfo(body);
      })
      .catch(() => { if (live) setError('Could not check this link. Check your connection and reload.'); });
    return () => { live = false; };
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validateNewPassword(password, confirm);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/activate/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? 'Could not save your password.');
      // Sign out of any other account in this browser, then in to this one.
      await supabase.auth.signOut().catch(() => undefined);
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: body.email, password });
      if (signInError) {
        router.replace('/login');
        return;
      }
      window.location.assign(homeForSchoolRole(body.role));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your password.');
      setSaving(false);
    }
  };

  if (!info) {
    return (
      <JoinShell title="Activate your account">
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>}
      </JoinShell>
    );
  }

  if (info.state !== 'pending') {
    const closed = CLOSED[info.state];
    return (
      <JoinShell title={closed.title} description={closed.text}>
        <Button asChild className="w-full"><Link href="/login">Go to sign in</Link></Button>
      </JoinShell>
    );
  }

  const activating = info.kind !== 'reset';
  const role = info.role ? schoolRoleLabel(info.role).toLowerCase() : 'member';
  return (
    <JoinShell
      title={activating ? `Welcome to ${info.school?.name ?? 'your school'}` : 'Set a new password'}
      description={
        activating
          ? <>{info.name ? `${info.name}, your` : 'Your'} school has made you an InsyteAI account as {role === 'administrator' ? 'an' : 'a'} {role}. Choose a password to activate it.</>
          : <>For <strong>{info.email}</strong> at {info.school?.name}.</>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="activate-email">Email</Label>
          <Input id="activate-email" value={info.email ?? ''} readOnly disabled className="h-11" autoComplete="username" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="activate-password">{activating ? 'Choose a password' : 'New password'}</Label>
          <Input id="activate-password" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH}
            value={password} onChange={(e) => setPassword(e.target.value)} disabled={saving} className="h-11" />
          <p className="text-xs text-muted-foreground">At least {MIN_PASSWORD_LENGTH} characters.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="activate-confirm">Type it again</Label>
          <Input id="activate-confirm" type="password" autoComplete="new-password" required
            value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={saving} className="h-11" />
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="h-11 w-full" disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : activating ? 'Activate my account' : 'Save password'}
        </Button>
      </form>
    </JoinShell>
  );
}
