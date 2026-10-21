'use client';

import { useContext, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import axios from 'axios';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { JoinShell } from '@/components/school/JoinShell';
import { SupabaseBrowserClientContext, SupabaseSessionContext } from '@/components/providers/SupabaseAuthProvider';
import { inviteRoleLabel } from '@/lib/school-invites';
import { gradeLevelLabel } from '@/lib/school-registration';

type InviteInfo = {
  state: 'pending' | 'expired' | 'accepted' | 'revoked' | 'invalid';
  email?: string;
  name?: string | null;
  role?: string;
  gradeLevel?: string | null;
  school?: { name: string };
  accountExists?: boolean;
};

const errorText = (error: unknown, fallback: string) =>
  (error as any)?.response?.data?.error ?? (error as any)?.message ?? fallback;

const CLOSED: Record<string, { title: string; body: string }> = {
  invalid: { title: 'Invite not found', body: 'This invite link is not valid. Check that you opened the whole link from the email.' },
  expired: { title: 'Invite expired', body: 'This invite link has expired. Ask your school to send you a new one.' },
  revoked: { title: 'Invite cancelled', body: 'This invite was cancelled. Ask your school if you still need access.' },
  accepted: { title: 'Invite already used', body: 'This invite has already been accepted. Log in to continue.' },
};

function roleText(info: InviteInfo) {
  const role = inviteRoleLabel(info.role ?? '').toLowerCase();
  return info.role === 'student' && info.gradeLevel ? `a student in ${gradeLevelLabel(info.gradeLevel)}` : `a ${role}`;
}

export default function JoinInvitePage() {
  const params = useParams();
  const token = String(params?.token ?? '');
  const supabase = useContext(SupabaseBrowserClientContext);
  const session = useContext(SupabaseSessionContext);
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    axios
      .get(`/api/invites/${encodeURIComponent(token)}`)
      .then(({ data }) => setInfo(data))
      .catch((err) => setInfo(err?.response?.data?.state ? err.response.data : { state: 'invalid' }));
  }, [token]);

  const returnPath = `/join/${encodeURIComponent(token)}`;
  const loginHref = `/login?redirectedFrom=${encodeURIComponent(returnPath)}`;

  const accept = async () => {
    const { data } = await axios.post(`/api/invites/${encodeURIComponent(token)}/accept`);
    // A full load picks up the new role in the app's session.
    window.location.assign(data.redirectTo ?? '/');
  };

  const handleAccept = async () => {
    setBusy(true);
    setError(null);
    try {
      await accept();
    } catch (err) {
      setError(errorText(err, 'Could not accept the invite.'));
      setBusy(false);
    }
  };

  const handleCreateAccount = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!info?.email) return;
    const form = new FormData(e.currentTarget);
    const name = String(form.get('name') ?? '').trim();
    const password = String(form.get('password') ?? '');
    if (password !== String(form.get('confirmPassword') ?? '')) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await axios.post(`/api/invites/${encodeURIComponent(token)}/signup`, { name, password });
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: info.email, password });
      if (signInError) throw signInError;
      await accept();
    } catch (err) {
      setError(errorText(err, 'Could not create your account.'));
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    const redirectTo = `${window.location.origin}${loginHref}`;
    const { error: oauthError } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
    if (oauthError) setError(oauthError.message);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  if (!info || session === undefined) {
    return <JoinShell title="Join your school"><div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div></JoinShell>;
  }

  if (info.state !== 'pending') {
    const closed = CLOSED[info.state] ?? CLOSED.invalid;
    return (
      <JoinShell title={closed.title} description={closed.body}>
        <Button asChild variant="outline"><Link href="/login">Go to log in</Link></Button>
      </JoinShell>
    );
  }

  const schoolName = info.school?.name ?? 'your school';
  const description = `You have been invited to join ${schoolName} as ${roleText(info)}.`;
  const signedInEmail = (session?.user?.email ?? '').toLowerCase();

  if (session?.user) {
    if (signedInEmail !== info.email) {
      return (
        <JoinShell title={`Join ${schoolName}`} description={description}>
          <p className="text-sm">
            You are signed in as <strong>{session.user.email}</strong>, but this invite is for <strong>{info.email}</strong>.
            Sign out, then open the invite link again.
          </p>
          <Button onClick={handleSignOut} variant="outline">Sign out</Button>
        </JoinShell>
      );
    }
    return (
      <JoinShell title={`Join ${schoolName}`} description={description}>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button className="w-full h-11" onClick={handleAccept} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Accept invite'}
        </Button>
      </JoinShell>
    );
  }

  if (info.accountExists) {
    return (
      <JoinShell title={`Join ${schoolName}`} description={description}>
        <p className="text-sm">You already have an account as <strong>{info.email}</strong>. Log in to accept the invite.</p>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button asChild className="w-full h-11"><Link href={loginHref}>Log in</Link></Button>
        <Button type="button" variant="outline" className="w-full h-11" onClick={handleGoogle}>Continue with Google</Button>
      </JoinShell>
    );
  }

  return (
    <JoinShell title={`Join ${schoolName}`} description={description}>
      <form onSubmit={handleCreateAccount} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" value={info.email} readOnly disabled className="h-11" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="name">Your name</Label>
          <Input id="name" name="name" required minLength={2} maxLength={120} defaultValue={info.name ?? ''} className="h-11" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Choose a password</Label>
          <Input id="password" name="password" type="password" required minLength={8} maxLength={72} className="h-11" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <Input id="confirmPassword" name="confirmPassword" type="password" required minLength={8} maxLength={72} className="h-11" />
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full h-11" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create account and join'}
        </Button>
        <Button type="button" variant="outline" className="w-full h-11" onClick={handleGoogle} disabled={busy}>
          Continue with Google
        </Button>
        <p className="text-center text-xs text-muted-foreground">Use Google only if your Google account is {info.email}.</p>
      </form>
    </JoinShell>
  );
}
