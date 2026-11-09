'use client';

import { useState, type FormEvent } from 'react';
import { Loader2, Mail, UserPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { homeworkRequest, useHomeworkData } from '@/components/homework/shared';
import { LoadError, Loading } from '@/components/records/shared';
import { AccountLinkNotice, type LinkResult } from '@/components/school-portal/AccountLinkNotice';
import { NATIVE_SELECT_CLASS } from '@/components/school-portal/PersonFormDialog';
import { SchoolPageHeader } from '@/components/school-portal/SchoolPortalProvider';
import type { SchoolGuardian } from '@/lib/school-guardians.server';
import { gradeLevelLabel } from '@/lib/school-registration';

type Loaded = {
  guardians: SchoolGuardian[];
  students: { userId: string; name: string; gradeLevel: string | null; className: string | null }[];
  emailConfigured: boolean;
};
type Sent = { email: string; link: LinkResult; kind: 'activate' | 'reset' };

export default function SchoolParentsPage() {
  const { toast } = useToast();
  const data = useHomeworkData<Loaded>('/api/schools/current/guardians');
  const [form, setForm] = useState({ name: '', email: '', studentId: '' });
  const [busy, setBusy] = useState<string | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);

  if (data.loading && !data.data) return <><SchoolPageHeader title="Parents" /><Loading /></>;
  if (data.error || !data.data) return <><SchoolPageHeader title="Parents" /><LoadError message={data.error || 'Could not load parents.'} retry={() => void data.refresh()} /></>;
  const { guardians, students } = data.data;

  const add = async (event: FormEvent) => {
    event.preventDefault();
    setBusy('add');
    setSent(null);
    try {
      const result = await homeworkRequest<{ created: boolean; link?: LinkResult; email: string }>('/api/schools/current/guardians', { method: 'POST', body: JSON.stringify(form) });
      toast({ title: result.created ? 'Parent account created' : 'Student added to this parent' });
      if (result.link) setSent({ email: result.email, link: result.link, kind: 'activate' });
      setForm({ name: '', email: '', studentId: '' });
      void data.refresh();
    } catch (error) {
      toast({ title: (error as Error).message || 'Could not add the parent.', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };
  const resend = async (guardian: SchoolGuardian) => {
    setBusy(guardian.guardianId);
    try {
      const link = await homeworkRequest<LinkResult & { kind: 'activate' | 'reset' }>(`/api/schools/current/guardians/${guardian.guardianId}`, { method: 'POST' });
      setSent({ email: guardian.email, link, kind: link.kind });
      if (link.emailed) toast({ title: `Email sent to ${guardian.email}` });
    } catch (error) {
      toast({ title: (error as Error).message || 'Could not send the link.', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };
  const remove = async (guardian: SchoolGuardian, child: SchoolGuardian['children'][number]) => {
    setBusy(child.linkId);
    try {
      await homeworkRequest(`/api/schools/current/guardians/${child.linkId}`, { method: 'DELETE' });
      toast({ title: `${guardian.name} no longer follows ${child.name}` });
      void data.refresh();
    } catch (error) {
      toast({ title: (error as Error).message || 'Could not remove the parent.', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <SchoolPageHeader title="Parents" description="Give parents and guardians a read-only view of their child’s attendance, marks and report cards." />
      {sent && <div className="mb-6"><AccountLinkNotice result={sent.link} email={sent.email} kind={sent.kind} /></div>}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <section aria-label="Parents" className="min-w-0">
          {guardians.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No parents yet. Add one with their email and pick their child.</CardContent></Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <ul className="divide-y">
                  {guardians.map((guardian) => (
                    <li key={guardian.guardianId} className="space-y-2 px-4 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="break-words font-medium">{guardian.name}</p>
                          <p className="break-all text-sm text-muted-foreground">{guardian.email} · {guardian.activated ? 'Active' : 'Not activated yet'}</p>
                        </div>
                        <Button variant="outline" className="min-h-11" disabled={busy !== null} onClick={() => void resend(guardian)}>
                          {busy === guardian.guardianId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                          {guardian.activated ? 'Send password link' : 'Resend activation'}
                        </Button>
                      </div>
                      <ul className="flex flex-wrap gap-2" aria-label={`Students ${guardian.name} follows`}>
                        {guardian.children.map((child) => (
                          <li key={child.linkId} className="flex items-center gap-1 rounded-full border py-0.5 pl-3 pr-0.5 text-sm">
                            <span className="break-words">{child.name}</span>
                            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" disabled={busy !== null} aria-label={`Stop ${guardian.name} following ${child.name}`} title="Remove" onClick={() => void remove(guardian, child)}>
                              {busy === child.linkId ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                            </Button>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </section>
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-lg">Add a parent</CardTitle>
            <CardDescription>They get an email to choose a password. To add a second child, use the same email again.</CardDescription>
          </CardHeader>
          <CardContent>
            {students.length === 0 ? (
              <p className="text-sm text-muted-foreground">Add students to your school first.</p>
            ) : (
              <form onSubmit={add} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="parent-student">Student</Label>
                  <select id="parent-student" className={NATIVE_SELECT_CLASS} required value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })}>
                    <option value="">Pick a student</option>
                    {students.map((s) => (
                      <option key={s.userId} value={s.userId}>{s.name}{s.gradeLevel ? ` (${gradeLevelLabel(s.gradeLevel)}${s.className ? ` ${s.className}` : ''})` : ''}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="parent-name">Parent’s name</Label>
                  <Input id="parent-name" required maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="off" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="parent-email">Parent’s email</Label>
                  <Input id="parent-email" type="email" required maxLength={254} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="off" />
                </div>
                <Button type="submit" disabled={busy !== null} className="min-h-11">
                  {busy === 'add' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />} Add parent
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
