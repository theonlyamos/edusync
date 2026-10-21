'use client';

import { Suspense, useContext, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { JoinShell } from '@/components/school/JoinShell';
import { AppUserContext, SupabaseBrowserClientContext, SupabaseSessionContext } from '@/components/providers/SupabaseAuthProvider';
import { getAppRedirect } from '@/lib/app-user';
import { MIN_PASSWORD_LENGTH, RESET_PASSWORD_PATH, validateNewPassword } from '@/lib/password-reset';

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useContext(SupabaseBrowserClientContext);
  const session = useContext(SupabaseSessionContext);
  const { user: appUser } = useContext(AppUserContext);

  const tokenHash = searchParams.get('token_hash');
  const code = searchParams.get('code');
  const linkError = searchParams.get('error') || searchParams.get('error_code');
  const [verifying, setVerifying] = useState(Boolean(tokenHash));
  const [verifyFailed, setVerifyFailed] = useState(false);
  const verified = useRef(false);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Links sent by support carry a token hash, which works in any browser.
  // Links from "Forgot password?" carry a code, which the auth provider swaps
  // for a session and then reloads this page without it.
  useEffect(() => {
    if (!tokenHash || verified.current) return;
    verified.current = true;
    supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' }).then(({ error: otpError }: { error: unknown }) => {
      if (otpError) setVerifyFailed(true);
      window.history.replaceState(null, '', RESET_PASSWORD_PATH);
      setVerifying(false);
    });
  }, [supabase, tokenHash]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validateNewPassword(password, confirm);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (updateError) {
      setError(updateError.code === 'same_password'
        ? 'Pick a password you have not used here before.'
        : updateError.message || 'Could not save your password. Please try again.');
      return;
    }
    setDone(true);
  };

  if (verifying || code || session === undefined) {
    return (
      <JoinShell title="Set a new password">
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
      </JoinShell>
    );
  }

  if (done) {
    return (
      <JoinShell title="Password saved" description="You are signed in with your new password.">
        <div className="flex items-center gap-3 rounded-md border p-4 text-sm">
          <CheckCircle2 className="h-5 w-5 text-green-600" />
          Use it next time you sign in.
        </div>
        <Button className="w-full" onClick={() => router.replace(getAppRedirect(appUser?.role ?? null))}>Continue</Button>
      </JoinShell>
    );
  }

  if (!session?.user || verifyFailed || (linkError && !session?.user)) {
    return (
      <JoinShell
        title="This link no longer works"
        description="Reset links work once and expire after an hour. A link from “Forgot password?” also has to be opened in the browser you asked from."
      >
        <Button asChild className="w-full"><Link href="/forgot-password">Send a new link</Link></Button>
        <p className="text-center text-sm"><Link href="/login" className="underline underline-offset-4">Back to sign in</Link></p>
      </JoinShell>
    );
  }

  return (
    <JoinShell title="Set a new password" description={session.user.email ? <>For <strong>{session.user.email}</strong></> : undefined}>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="new-password">New password</Label>
          <Input id="new-password" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH}
            value={password} onChange={(e) => setPassword(e.target.value)} disabled={saving} className="h-11" />
          <p className="text-xs text-muted-foreground">At least {MIN_PASSWORD_LENGTH} characters.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm-password">Type it again</Label>
          <Input id="confirm-password" type="password" autoComplete="new-password" required
            value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={saving} className="h-11" />
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="h-11 w-full" disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save password'}
        </Button>
      </form>
    </JoinShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordContent />
    </Suspense>
  );
}
