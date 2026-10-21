'use client';

import { useContext, useState } from 'react';
import Link from 'next/link';
import { Loader2, MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { JoinShell } from '@/components/school/JoinShell';
import { SupabaseBrowserClientContext } from '@/components/providers/SupabaseAuthProvider';
import { RESET_PASSWORD_PATH } from '@/lib/password-reset';

export default function ForgotPasswordPage() {
  const supabase = useContext(SupabaseBrowserClientContext);
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError(null);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}${RESET_PASSWORD_PATH}`,
    });
    setSending(false);
    // Say the same thing whether or not the account exists. Only rate limits
    // and outages are worth showing.
    if (resetError && resetError.status !== 400 && resetError.status !== 404) {
      setError(resetError.status === 429
        ? 'Too many requests. Wait a minute and try again.'
        : 'Could not send the email. Please try again.');
      return;
    }
    setSent(true);
  };

  if (sent) {
    return (
      <JoinShell title="Check your email" description={<>If an account uses <strong>{email}</strong>, we sent it a link to set a new password.</>}>
        <div className="flex items-start gap-3 rounded-md border p-4 text-sm text-muted-foreground">
          <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <p>Open the link in this same browser. It expires after an hour. No email after a few minutes? Check your spam folder or try again.</p>
        </div>
        <Button variant="outline" className="w-full" onClick={() => setSent(false)}>Try a different email</Button>
        <p className="text-center text-sm"><Link href="/login" className="underline underline-offset-4">Back to sign in</Link></p>
      </JoinShell>
    );
  }

  return (
    <JoinShell title="Forgot your password?" description="Enter your email and we will send you a link to set a new one.">
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} disabled={sending} className="h-11" />
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="h-11 w-full" disabled={sending || !email.trim()}>
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send reset link'}
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        Remembered it? <Link href="/login" className="font-medium text-foreground underline underline-offset-4">Sign in</Link>
      </p>
    </JoinShell>
  );
}
