'use client';

import { useMemo, useState } from 'react';
import axios from 'axios';
import { Download, Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { parseInviteCsv } from '@/lib/school-invites';

export type InviteResult = {
  email: string;
  outcome: 'invited' | 'skipped' | 'failed';
  emailed: boolean;
  message?: string;
  inviteUrl?: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  grades: string[];
  onSent: () => void;
};

const TEMPLATE = 'name,email,role,grade\nAma Mensah,ama@example.com,student,Primary 4\nKofi Boateng,kofi@example.com,teacher,\n';
const TEMPLATE_HREF = `data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`;

/** Upload or paste a CSV of people, check every row, then send all the invites at once. */
export function CsvInviteDialog({ open, onOpenChange, grades, onSent }: Props) {
  const [csv, setCsv] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<InviteResult[] | null>(null);

  const parsed = useMemo(() => (csv.trim() ? parseInviteCsv(csv, grades) : null), [csv, grades]);
  const ready = parsed?.rows.filter((row) => row.invite) ?? [];
  const problems = parsed?.rows.filter((row) => row.error) ?? [];

  const reset = () => {
    setCsv('');
    setResults(null);
    setError(null);
  };

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 1_000_000) {
      setError('That file is too big. Keep it under 1 MB.');
      return;
    }
    setError(null);
    setResults(null);
    setCsv(await file.text());
  };

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      const { data } = await axios.post('/api/schools/current/invites', {
        invites: ready.map((row) => ({
          email: row.invite!.email,
          name: row.invite!.name,
          role: row.invite!.role,
          gradeLevel: row.invite!.gradeLevel,
        })),
      });
      setResults(data.results ?? []);
      onSent();
    } catch (err) {
      setError((err as any)?.response?.data?.error ?? 'Could not send the invites. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const invited = results?.filter((r) => r.outcome === 'invited') ?? [];
  const notEmailed = invited.filter((r) => !r.emailed);
  const skipped = results?.filter((r) => r.outcome === 'skipped') ?? [];
  const failed = results?.filter((r) => r.outcome === 'failed') ?? [];

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) reset(); onOpenChange(next); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import people from a CSV</DialogTitle>
          <DialogDescription>
            Columns: name, email, role (teacher, student or admin) and grade (for students, like Primary 4 or JHS 1).
          </DialogDescription>
        </DialogHeader>

        {results ? (
          <div className="space-y-3 text-sm">
            <p className="font-medium">
              {invited.length} invited{skipped.length ? `, ${skipped.length} already in your school` : ''}{failed.length ? `, ${failed.length} failed` : ''}.
            </p>
            {notEmailed.length > 0 && (
              <p className="text-muted-foreground">
                {notEmailed.length} invites were saved but not emailed. Use Resend in the invite list to email them, or to get a link you can share yourself.
              </p>
            )}
            {failed.length > 0 && (
              <ul className="max-h-48 list-disc overflow-auto pl-5 text-destructive">
                {failed.map((r, i) => <li key={`${r.email}-${i}`}>{r.email || 'Row with no email'}: {r.message}</li>)}
              </ul>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="outline" size="sm">
                <label className="cursor-pointer">
                  <Upload className="mr-1 h-4 w-4" />Choose CSV file
                  <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => readFile(e.target.files?.[0])} />
                </label>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <a href={TEMPLATE_HREF} download="invite-template.csv"><Download className="mr-1 h-4 w-4" />Template</a>
              </Button>
            </div>
            <div className="space-y-1">
              <Label htmlFor="csv-text">Or paste it here</Label>
              <Textarea id="csv-text" rows={5} value={csv} onChange={(e) => { setCsv(e.target.value); setResults(null); }} placeholder={TEMPLATE} className="font-mono text-xs" />
            </div>
            {parsed?.error && <p role="alert" className="text-sm text-destructive">{parsed.error}</p>}
            {parsed && parsed.rows.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm">
                  {ready.length} ready to invite{problems.length ? `, ${problems.length} with problems (they will be left out)` : ''}.
                </p>
                <div className="max-h-72 overflow-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">Row</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Grade</TableHead>
                        <TableHead>Check</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parsed.rows.map((row) => (
                        <TableRow key={row.line} className={row.error ? 'bg-destructive/5' : undefined}>
                          <TableCell>{row.line}</TableCell>
                          <TableCell>{row.input.name}</TableCell>
                          <TableCell>{row.input.email}</TableCell>
                          <TableCell>{row.input.role}</TableCell>
                          <TableCell>{row.input.grade}</TableCell>
                          <TableCell className={row.error ? 'text-destructive' : 'text-green-700 dark:text-green-400'}>
                            {row.error ?? 'OK'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        )}

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          {results ? (
            <Button onClick={() => { reset(); onOpenChange(false); }}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>Cancel</Button>
              <Button onClick={send} disabled={sending || ready.length === 0}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : `Send ${ready.length} invite${ready.length === 1 ? '' : 's'}`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
