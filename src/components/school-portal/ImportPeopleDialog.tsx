'use client';

import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Download, Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  CSV_TEMPLATES,
  IMPORT_BATCH_SIZE,
  csvCell,
  parsePeopleCsv,
  type CsvPersonRow,
  type NewPerson,
  type SchoolPersonRole,
} from '@/lib/school-people';

type Outcome = { email: string; outcome: 'added' | 'failed'; message?: string; emailed?: boolean; url?: string; linkFailed?: boolean };

const ROLE_PLURAL: Record<SchoolPersonRole, string> = { student: 'students', teacher: 'teachers', admin: 'administrators' };

const COLUMNS: Record<SchoolPersonRole, string> = {
  student: 'name, email, grade, and optionally guardian name, guardian contact and date of birth (YYYY-MM-DD)',
  teacher: 'name, email, and optionally subjects and grades (separate several with semicolons)',
  admin: 'name and email',
};

/** A CSV of people whose links weren't emailed, for the admin to pass on. */
export function linksCsvHref(results: Outcome[]): string | null {
  const rows = results.filter((r) => r.outcome === 'added' && r.url)
  if (rows.length === 0) return null
  const csv = ['email,activation_link', ...rows.map((r) => `${csvCell(r.email)},${csvCell(r.url!)}`)].join('\n') + '\n'
  return `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`
}

function toBody(person: NewPerson) {
  return {
    name: person.name,
    email: person.email,
    gradeLevel: person.gradeLevel,
    guardianName: person.guardianName,
    guardianContact: person.guardianContact,
    dateOfBirth: person.dateOfBirth,
    subjects: person.subjects,
    grades: person.grades,
  };
}

type Props = {
  role: SchoolPersonRole;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolGrades: string[];
  onDone: () => void;
};

/** Adds many people from a CSV file. Each gets an activation email. */
export function ImportPeopleDialog({ role, open, onOpenChange, schoolGrades, onDone }: Props) {
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<Outcome[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCsv('');
    setFileName(null);
    setResults(null);
    setError(null);
    setProgress(0);
  }, [open]);

  const parsed = useMemo(() => (csv.trim() ? parsePeopleCsv(csv, role, schoolGrades) : null), [csv, role, schoolGrades]);
  const ready = parsed?.rows.filter((r): r is CsvPersonRow & { person: NewPerson } => Boolean(r.person)) ?? [];
  const problems = parsed?.rows.filter((r) => r.error) ?? [];
  const plural = ROLE_PLURAL[role];
  const templateHref = `data:text/csv;charset=utf-8,${encodeURIComponent(CSV_TEMPLATES[role])}`;

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 1_000_000) {
      setError('That file is too big. Use a CSV under 1 MB.');
      return;
    }
    setError(null);
    setFileName(file.name);
    setCsv(await file.text());
  };

  const run = async () => {
    setRunning(true);
    setError(null);
    setProgress(0);
    const all: Outcome[] = [];
    try {
      for (let i = 0; i < ready.length; i += IMPORT_BATCH_SIZE) {
        const part = ready.slice(i, i + IMPORT_BATCH_SIZE);
        const { data } = await axios.post('/api/schools/current/people/import', { role, people: part.map((r) => toBody(r.person)) });
        all.push(...(data.results as Outcome[]));
        setProgress(Math.min(ready.length, i + part.length));
      }
    } catch (err) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'The import stopped. People added so far are listed below.');
    } finally {
      setResults(all);
      setRunning(false);
      if (all.some((r) => r.outcome === 'added')) onDone();
    }
  };

  const added = results?.filter((r) => r.outcome === 'added') ?? [];
  const failed = results?.filter((r) => r.outcome === 'failed') ?? [];
  const linksHref = results ? linksCsvHref(results) : null;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!running) onOpenChange(next); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import {plural} from a CSV</DialogTitle>
          <DialogDescription>
            Columns: {COLUMNS[role]}. A header row is optional. Everyone gets an email to activate their account.
          </DialogDescription>
        </DialogHeader>

        {results ? (
          <div className="space-y-4 text-sm">
            <p>
              Added <strong>{added.length}</strong> {added.length === 1 ? role : plural}
              {failed.length > 0 && <>; <strong>{failed.length}</strong> could not be added</>}.
              {added.length > 0 && (added.every((r) => r.emailed) ? ' Their activation emails are on the way.' : '')}
            </p>
            {linksHref && (
              <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-50">
                <p>Some activation emails didn’t go out (school email isn’t set up yet). Download the links and pass each one on to its owner only.</p>
                <Button asChild variant="outline" size="sm" className="bg-background text-foreground">
                  <a href={linksHref} download={`${role}-activation-links.csv`}><Download className="mr-2 h-4 w-4" />Download activation links</a>
                </Button>
              </div>
            )}
            {added.some((r) => r.linkFailed) && (
              <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-50">
                {added.filter((r) => r.linkFailed).length} accounts were created without an activation link. Find them on the list and use “Resend activation email”.
              </p>
            )}
            {failed.length > 0 && (
              <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-3">
                {failed.map((r, i) => (
                  <li key={`${r.email}-${i}`}><span className="break-all font-medium">{r.email || '(no email)'}</span>: {r.message}</li>
                ))}
              </ul>
            )}
            {error && <p role="alert" className="text-destructive">{error}</p>}
            <DialogFooter><Button onClick={() => onOpenChange(false)}>Done</Button></DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="outline" size="sm">
                <label className="cursor-pointer">
                  <Upload className="mr-2 h-4 w-4" />
                  {fileName ? 'Choose another file' : 'Choose a CSV file'}
                  <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => readFile(e.target.files?.[0])} disabled={running} />
                </label>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <a href={templateHref} download={`${role}-template.csv`}><Download className="mr-2 h-4 w-4" />Download a template</a>
              </Button>
              {fileName && <span className="text-sm text-muted-foreground">{fileName}</span>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="csv-text">Or paste the rows here</Label>
              <Textarea id="csv-text" rows={5} value={csv} onChange={(e) => { setCsv(e.target.value); setFileName(null); }} placeholder={CSV_TEMPLATES[role]} disabled={running} className="font-mono text-xs" />
            </div>

            {parsed?.error && <p role="alert" className="text-sm text-destructive">{parsed.error}</p>}
            {parsed && !parsed.error && (
              <div className="space-y-2 text-sm">
                <p><strong>{ready.length}</strong> ready to add{problems.length > 0 && <>, <strong>{problems.length}</strong> with problems (they’ll be skipped)</>}.</p>
                {problems.length > 0 && (
                  <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-3">
                    {problems.map((r) => (
                      <li key={r.line}>Line {r.line}{r.email ? ` (${r.email})` : ''}: {r.error}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={running}>Cancel</Button>
              <Button onClick={run} disabled={running || ready.length === 0}>
                {running ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Adding {progress} of {ready.length}…</> : `Add ${ready.length} ${ready.length === 1 ? role === 'admin' ? 'administrator' : role : plural}`}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
