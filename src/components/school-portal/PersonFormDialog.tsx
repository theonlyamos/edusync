'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { GradeLevelPicker } from '@/components/school/GradeLevelPicker';
import { AccountLinkNotice, type LinkResult } from '@/components/school-portal/AccountLinkNotice';
import { GRADE_LEVELS, SUBJECTS } from '@/lib/constants';
import { gradeLevelLabel } from '@/lib/school-registration';
import type { SchoolPersonRole } from '@/lib/school-people';
import type { SchoolPerson } from '@/lib/school-people.server';

export const NATIVE_SELECT_CLASS =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

const ROLE_NOUN: Record<SchoolPersonRole, string> = { student: 'student', teacher: 'teacher', admin: 'administrator' };

type Props = {
  role: SchoolPersonRole;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit this person; add someone new when left out. */
  person?: SchoolPerson | null;
  schoolGrades: string[];
  onSaved: () => void;
};

type Form = {
  name: string;
  email: string;
  gradeLevel: string;
  guardianName: string;
  guardianContact: string;
  dateOfBirth: string;
  subjects: string;
  grades: string[];
};

const emptyForm = (gradeLevel = ''): Form => ({
  name: '',
  email: '',
  gradeLevel,
  guardianName: '',
  guardianContact: '',
  dateOfBirth: '',
  subjects: '',
  grades: [],
});

const formFor = (person: SchoolPerson): Form => ({
  name: person.name,
  email: person.email,
  gradeLevel: person.gradeLevel ?? '',
  guardianName: person.guardianName ?? '',
  guardianContact: person.guardianContact ?? '',
  dateOfBirth: person.dateOfBirth ?? '',
  subjects: (person.subjects ?? []).join(', '),
  grades: person.grades ?? [],
});

function errorMessage(error: unknown, fallback: string) {
  return (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback;
}

/** Add someone to the school, or edit their details. */
export function PersonFormDialog({ role, open, onOpenChange, person, schoolGrades, onSaved }: Props) {
  const editing = Boolean(person);
  const gradeOptions = schoolGrades.length > 0 ? schoolGrades : [...GRADE_LEVELS];
  const [form, setForm] = useState<Form>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<{ email: string; link: LinkResult } | null>(null);
  const [emailLink, setEmailLink] = useState<LinkResult | null>(null);
  const [listedSubjects, setListedSubjects] = useState<string[]>([]);

  // Suggest the school's own subjects when it has a list.
  useEffect(() => {
    if (!open || role !== 'teacher') return;
    let cancelled = false;
    axios.get('/api/schools/current/subjects')
      .then(({ data }) => {
        if (!cancelled) setListedSubjects((data.subjects ?? []).filter((s: { archived?: boolean }) => !s.archived).map((s: { name: string }) => s.name));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [open, role]);

  useEffect(() => {
    if (!open) return;
    setForm(person ? formFor(person) : emptyForm(gradeOptions.length === 1 ? gradeOptions[0] : ''));
    setError(null);
    setAdded(null);
    setEmailLink(null);
  }, [open, person]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
  const emailLocked = editing && person?.status === 'active';
  const noun = ROLE_NOUN[role];

  const payload = () => {
    const body: Record<string, unknown> = { name: form.name, email: form.email };
    if (role === 'student') {
      Object.assign(body, {
        gradeLevel: form.gradeLevel,
        guardianName: form.guardianName,
        guardianContact: form.guardianContact,
        dateOfBirth: form.dateOfBirth,
      });
    } else if (role === 'teacher') {
      Object.assign(body, { subjects: form.subjects, grades: form.grades });
    }
    if (editing && emailLocked) delete body.email;
    return body;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (editing && person) {
        const { data } = await axios.patch(`/api/schools/current/people/${person.memberId}`, payload());
        onSaved();
        if (data?.link) setEmailLink(data.link);
        else onOpenChange(false);
      } else {
        const { data } = await axios.post('/api/schools/current/people', { role, ...payload() });
        setAdded({ email: data.email, link: data });
        onSaved();
      }
    } catch (err) {
      setError(errorMessage(err, editing ? 'Could not save the changes.' : `Could not add this ${noun}.`));
    } finally {
      setSaving(false);
    }
  };

  const addAnother = () => {
    setForm(emptyForm(form.gradeLevel));
    setAdded(null);
    setError(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${person?.name}` : `Add a ${noun}`}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'Changes save to their profile straight away.'
              : `We create the account and email them a link to choose a password and activate it.`}
          </DialogDescription>
        </DialogHeader>

        {added ? (
          <div className="space-y-4">
            <p className="text-sm">Added <strong>{form.name}</strong>.</p>
            <AccountLinkNotice result={added.link} email={added.email} />
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Done</Button>
              <Button onClick={addAnother}>Add another {noun}</Button>
            </DialogFooter>
          </div>
        ) : emailLink ? (
          <div className="space-y-4">
            <p className="text-sm">Saved. Their old activation link no longer works.</p>
            <AccountLinkNotice result={emailLink} email={form.email} />
            <DialogFooter><Button onClick={() => onOpenChange(false)}>Done</Button></DialogFooter>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="person-name">Full name</Label>
              <Input id="person-name" value={form.name} onChange={(e) => set('name', e.target.value)} required minLength={2} maxLength={120} autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="person-email">Email</Label>
              <Input
                id="person-email"
                type="email"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                required
                maxLength={254}
                autoComplete="off"
                disabled={emailLocked}
              />
              <p className="text-xs text-muted-foreground">
                {emailLocked
                  ? 'They sign in with this email, so only they can change it.'
                  : editing
                    ? 'Fixing a typo sends a new activation link to the new address.'
                    : 'They sign in with this email. The activation link goes here.'}
              </p>
            </div>

            {role === 'student' && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="person-grade">Grade</Label>
                  <select id="person-grade" className={NATIVE_SELECT_CLASS} value={form.gradeLevel} onChange={(e) => set('gradeLevel', e.target.value)} required>
                    <option value="" disabled>Pick a grade</option>
                    {gradeOptions.map((g) => <option key={g} value={g}>{gradeLevelLabel(g)}</option>)}
                  </select>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="person-guardian">Parent or guardian <span className="font-normal text-muted-foreground">(optional)</span></Label>
                    <Input id="person-guardian" value={form.guardianName} onChange={(e) => set('guardianName', e.target.value)} maxLength={120} autoComplete="off" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="person-guardian-contact">Guardian phone or email <span className="font-normal text-muted-foreground">(optional)</span></Label>
                    <Input id="person-guardian-contact" value={form.guardianContact} onChange={(e) => set('guardianContact', e.target.value)} maxLength={120} autoComplete="off" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="person-dob">Date of birth <span className="font-normal text-muted-foreground">(optional)</span></Label>
                  <Input id="person-dob" type="date" value={form.dateOfBirth} max={new Date().toISOString().slice(0, 10)} onChange={(e) => set('dateOfBirth', e.target.value)} />
                </div>
              </>
            )}

            {role === 'teacher' && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="person-subjects">Subjects <span className="font-normal text-muted-foreground">(optional)</span></Label>
                  <Input id="person-subjects" list="subject-suggestions" value={form.subjects} onChange={(e) => set('subjects', e.target.value)} placeholder="e.g. Mathematics, Science" autoComplete="off" />
                  <datalist id="subject-suggestions">{(listedSubjects.length ? listedSubjects : SUBJECTS).map((s) => <option key={s} value={s} />)}</datalist>
                  <p className="text-xs text-muted-foreground">
                    {listedSubjects.length
                      ? 'Separate subjects with commas. Subjects on your list are set from who teaches what on the Subjects page.'
                      : 'Separate subjects with commas.'}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>Grades they teach <span className="font-normal text-muted-foreground">(optional)</span></Label>
                  <GradeLevelPicker value={form.grades} onChange={(grades) => set('grades', grades)} options={schoolGrades} label="Grades they teach" />
                </div>
              </>
            )}

            {role === 'admin' && !editing && (
              <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
                Administrators can manage everyone at the school, its timetables, settings and billing.
              </p>
            )}

            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? 'Save changes' : `Add ${noun}`}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
