'use client';

import { useContext, useEffect, useState } from 'react';
import Link from 'next/link';
import axios from 'axios';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { JoinShell } from '@/components/school/JoinShell';
import { SupabaseSessionContext } from '@/components/providers/SupabaseAuthProvider';
import { isJoinCodeFormat, normalizeJoinCode } from '@/lib/school-invites';
import { gradeLevelLabel } from '@/lib/school-registration';

type CodeInfo = { code: string; school: { name: string }; gradeLevel: string };

const errorText = (error: unknown, fallback: string) => (error as any)?.response?.data?.error ?? fallback;

/** Students enter a class code from their teacher, then ask to join that school. */
export default function JoinWithCodePage() {
  const session = useContext(SupabaseSessionContext);
  const [input, setInput] = useState('');
  const [info, setInfo] = useState<CodeInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requested, setRequested] = useState(false);

  const lookUp = async (raw: string) => {
    const code = normalizeJoinCode(raw);
    if (!isJoinCodeFormat(code)) {
      setError('Class codes are 6 to 12 letters and numbers.');
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const { data } = await axios.get(`/api/join-codes/${code}`);
      setInfo(data);
      window.history.replaceState(null, '', `/join?code=${code}`);
    } catch (err) {
      setError(errorText(err, 'Could not check that code.'));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('code');
    if (code) {
      setInput(code);
      lookUp(code);
    }
  }, []);

  const requestToJoin = async () => {
    if (!info) return;
    setBusy(true);
    setError(null);
    try {
      await axios.post(`/api/join-codes/${info.code}`);
      setRequested(true);
    } catch (err) {
      setError(errorText(err, 'Could not send your request.'));
    } finally {
      setBusy(false);
    }
  };

  if (requested && info) {
    return (
      <JoinShell title="Request sent">
        <div className="flex gap-3 rounded-md border p-4">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
          <p className="text-sm">
            You asked to join <strong>{info.school.name}</strong> in {gradeLevelLabel(info.gradeLevel)}.
            A school admin will approve you, and then your lessons will show up when you log in.
          </p>
        </div>
      </JoinShell>
    );
  }

  const returnPath = info ? `/join?code=${info.code}` : '/join';
  const back = `?redirectedFrom=${encodeURIComponent(returnPath)}`;

  return (
    <JoinShell title="Join your class" description="Enter the class code your teacher gave you.">
      <form
        onSubmit={(e) => { e.preventDefault(); lookUp(input); }}
        className="flex gap-2"
      >
        <div className="flex-1 space-y-1">
          <Label htmlFor="code" className="sr-only">Class code</Label>
          <Input
            id="code"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="e.g. HK7M2QPX"
            autoCapitalize="characters"
            autoComplete="off"
            className="h-11 font-mono uppercase tracking-widest"
          />
        </div>
        <Button type="submit" variant="outline" className="h-11" disabled={busy || !input.trim()}>
          {busy && !info ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Check'}
        </Button>
      </form>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      {info && (
        <div className="space-y-4 rounded-md border p-4">
          <p>
            <strong>{info.school.name}</strong>
            <span className="text-muted-foreground"> · {gradeLevelLabel(info.gradeLevel)}</span>
          </p>
          {session === undefined ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : session?.user ? (
            <Button className="w-full h-11" onClick={requestToJoin} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Ask to join'}
            </Button>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Create an account or log in first. You will come back here after.</p>
              <Button asChild className="w-full h-11"><Link href={`/signup${back}`}>Create an account</Link></Button>
              <Button asChild variant="outline" className="w-full h-11"><Link href={`/login${back}`}>Log in</Link></Button>
            </div>
          )}
        </div>
      )}
    </JoinShell>
  );
}
