'use client';

import { useCallback, useContext, useEffect, useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { SupabaseBrowserClientContext } from '@/components/providers/SupabaseAuthProvider';
import { cleanCode } from '@/lib/mfa';

type Factor = { id: string; status: string; factor_type: string };
type Setup = { factorId: string; qr: string; secret: string };

/** Turn two-step sign-in (an authenticator app code after the password) on or off. */
export function TwoStepCard() {
  const supabase = useContext(SupabaseBrowserClientContext);
  const { toast } = useToast();
  const [factor, setFactor] = useState<Factor | null | undefined>(undefined);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [confirmOff, setConfirmOff] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) return setFactor(null);
    setFactor(((data?.totp ?? []) as Factor[]).find((item) => item.status === 'verified') ?? null);
  }, [supabase]);
  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  const start = async () => {
    setBusy(true);
    setProblem('');
    try {
      // A setup that was started and abandoned would block a new one.
      const { data: existing } = await supabase.auth.mfa.listFactors();
      for (const stale of ((existing?.all ?? []) as Factor[]).filter((item) => item.factor_type === 'totp' && item.status !== 'verified')) {
        await supabase.auth.mfa.unenroll({ factorId: stale.id });
      }
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Authenticator ${Date.now()}` });
      if (error) throw error;
      setSetup({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    } catch (error) {
      setProblem((error as Error).message || 'Two-step sign-in could not be started. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!setup) return;
    setBusy(true);
    setProblem('');
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: setup.factorId, code });
    setBusy(false);
    if (error) return setProblem('That code didn’t match. Check the app and try the newest code.');
    setSetup(null);
    setCode('');
    toast({ title: 'Two-step sign-in is on' });
    void load();
  };

  const cancel = async () => {
    if (setup) await supabase.auth.mfa.unenroll({ factorId: setup.factorId }).catch(() => {});
    setSetup(null);
    setCode('');
    setProblem('');
  };

  const turnOff = async () => {
    if (!factor) return;
    setBusy(true);
    const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
    setBusy(false);
    setConfirmOff(false);
    if (error) return toast({ title: 'Two-step sign-in could not be turned off', description: 'Sign out, sign in again with your code, then retry.', variant: 'destructive' });
    // The session goes back to password-only now that no code is required.
    await supabase.auth.refreshSession().catch(() => {});
    toast({ title: 'Two-step sign-in is off' });
    void load();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" aria-hidden /> Two-step sign-in
        </CardTitle>
        <CardDescription>
          Ask for a six-digit code from an authenticator app after your password, so a stolen password alone can’t open your account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {factor === undefined ? (
          <Loader2 className="h-5 w-5 animate-spin" aria-label="Loading" />
        ) : factor ? (
          <>
            <p className="text-sm"><span className="font-medium text-emerald-600 dark:text-emerald-400">On.</span> You’ll be asked for a code each time you sign in.</p>
            {confirmOff ? (
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm text-muted-foreground">Turn it off? Your password alone will sign you in.</p>
                <Button variant="destructive" disabled={busy} onClick={turnOff} className="min-h-11">Turn off</Button>
                <Button variant="outline" onClick={() => setConfirmOff(false)} className="min-h-11">Keep it on</Button>
              </div>
            ) : (
              <Button variant="outline" onClick={() => setConfirmOff(true)} className="min-h-11">Turn off two-step sign-in</Button>
            )}
          </>
        ) : setup ? (
          <form onSubmit={confirm} className="space-y-4">
            <ol className="list-decimal space-y-3 pl-5 text-sm">
              <li>Open an authenticator app (Google Authenticator, Microsoft Authenticator, Authy or similar) and scan this code.</li>
              <li className="list-none">
                {/* The code is an SVG the auth server made for this account. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={setup.qr} alt="QR code for your authenticator app" width={176} height={176} className="rounded-md bg-white p-2" />
                <p className="mt-2 text-muted-foreground">Can’t scan? Type this key into the app instead:</p>
                <code className="mt-1 block break-all rounded bg-muted px-2 py-1 text-xs">{setup.secret}</code>
              </li>
              <li>Enter the six-digit code the app shows.</li>
            </ol>
            <div className="max-w-[12rem] space-y-1.5">
              <Label htmlFor="two-step-code">Code</Label>
              <Input id="two-step-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(cleanCode(e.target.value))} placeholder="123456" required />
            </div>
            {problem && <p role="alert" className="text-sm text-destructive">{problem}</p>}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={busy || code.length !== 6} className="min-h-11">
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />} Turn on
              </Button>
              <Button type="button" variant="outline" onClick={cancel} className="min-h-11">Cancel</Button>
            </div>
          </form>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">Off. Only your password is needed to sign in.</p>
            {problem && <p role="alert" className="text-sm text-destructive">{problem}</p>}
            <Button onClick={start} disabled={busy} className="min-h-11">
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />} Set up two-step sign-in
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
