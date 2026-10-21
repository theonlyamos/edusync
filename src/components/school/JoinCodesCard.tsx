'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import { Check, Copy, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GRADE_LEVELS } from '@/lib/constants';
import { gradeLevelLabel } from '@/lib/school-registration';

type JoinCode = {
  id: string;
  code: string;
  gradeLevel: string;
  createdBy: string | null;
  expiresAt: string | null;
  expired: boolean;
};

const errorText = (error: unknown, fallback: string) => (error as any)?.response?.data?.error ?? fallback;

export function joinCodeLink(code: string) {
  return `${window.location.origin}/join?code=${encodeURIComponent(code)}`;
}

/** Create, share and turn off class join codes. */
export function JoinCodesCard({ showCreator = false }: { showCreator?: boolean }) {
  const [codes, setCodes] = useState<JoinCode[]>([]);
  const [grades, setGrades] = useState<string[]>([]);
  const [grade, setGrade] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const { data } = await axios.get('/api/schools/current/join-codes');
      setCodes(data.codes ?? []);
      setGrades(data.grades?.length ? data.grades : [...GRADE_LEVELS]);
    } catch (err) {
      setError(errorText(err, 'Could not load class codes.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!grade) return;
    setBusy('create');
    setError(null);
    try {
      await axios.post('/api/schools/current/join-codes', { gradeLevel: grade });
      await load();
    } catch (err) {
      setError(errorText(err, 'Could not create a code.'));
    } finally {
      setBusy(null);
    }
  };

  const turnOff = async (id: string) => {
    setBusy(id);
    setError(null);
    try {
      await axios.delete(`/api/schools/current/join-codes/${id}`);
      setCodes((current) => current.filter((c) => c.id !== id));
    } catch (err) {
      setError(errorText(err, 'Could not turn off the code.'));
    } finally {
      setBusy(null);
    }
  };

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(joinCodeLink(code));
      setCopied(code);
      setTimeout(() => setCopied((c) => (c === code ? null : c)), 2000);
    } catch {
      setError('Could not copy. Share the code instead.');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Class join codes</CardTitle>
        <CardDescription>
          Share a code or its link with a class. Students enter it on the /join page, and a school admin approves them before they get access.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="join-code-grade">Grade</Label>
            <Select value={grade} onValueChange={setGrade}>
              <SelectTrigger id="join-code-grade" className="w-44"><SelectValue placeholder="Pick a grade" /></SelectTrigger>
              <SelectContent>
                {grades.map((g) => <SelectItem key={g} value={g}>{gradeLevelLabel(g)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={create} disabled={!grade || busy !== null}>
            {busy === 'create' ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="mr-1 h-4 w-4" />New code</>}
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : codes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No codes yet.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {codes.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div>
                  <p className="font-mono text-lg font-semibold tracking-widest">{c.code}</p>
                  <p className="text-sm text-muted-foreground">
                    {gradeLevelLabel(c.gradeLevel)}
                    {showCreator && c.createdBy ? ` · by ${c.createdBy}` : ''}
                    {c.expired ? ' · expired' : c.expiresAt ? ` · until ${new Date(c.expiresAt).toLocaleDateString()}` : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => copy(c.code)}>
                    {copied === c.code ? <><Check className="mr-1 h-4 w-4" />Copied</> : <><Copy className="mr-1 h-4 w-4" />Copy link</>}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => turnOff(c.id)} disabled={busy !== null}>
                    {busy === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Turn off'}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
