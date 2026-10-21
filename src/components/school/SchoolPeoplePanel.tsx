'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import { Check, Copy, FileUp, Loader2, Send } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CsvInviteDialog, type InviteResult } from '@/components/school/CsvInviteDialog';
import { JoinCodesCard } from '@/components/school/JoinCodesCard';
import { GRADE_LEVELS } from '@/lib/constants';
import { inviteRoleLabel, type InviteState } from '@/lib/school-invites';
import { gradeLevelLabel } from '@/lib/school-registration';

type InviteRow = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  gradeLevel: string | null;
  state: InviteState;
  expiresAt: string;
  lastSentAt: string | null;
};

type JoinRequest = {
  id: string;
  name: string | null;
  email: string | null;
  gradeLevel: string;
  code: string | null;
  createdAt: string;
};

type Member = {
  id: string;
  user_id: string;
  role: string;
  is_active: boolean;
  joined_at: string;
  users: { id: string; name: string; email: string };
};

type Props = {
  members: Member[];
  currentUserId: string | null;
  currentUserRole: string | null;
  onMembersChanged: () => void;
};

const STATE_LABEL: Record<InviteState, string> = {
  pending: 'Waiting',
  expired: 'Expired',
  accepted: 'Joined',
  revoked: 'Cancelled',
};

const errorText = (error: unknown, fallback: string) => (error as any)?.response?.data?.error ?? fallback;

function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={async () => {
        await navigator.clipboard.writeText(url).catch(() => undefined);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <><Check className="mr-1 h-4 w-4" />Copied</> : <><Copy className="mr-1 h-4 w-4" />Copy invite link</>}
    </Button>
  );
}

/** Everything a school owner or admin needs to bring people in and manage who has access. */
export function SchoolPeoplePanel({ members, currentUserId, currentUserRole, onMembersChanged }: Props) {
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [grades, setGrades] = useState<string[]>([...GRADE_LEVELS]);
  const [emailConfigured, setEmailConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; url?: string } | null>(null);
  const [csvOpen, setCsvOpen] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const [form, setForm] = useState({ email: '', name: '', role: 'teacher', gradeLevel: '' });

  const load = async () => {
    try {
      const [inviteRes, requestRes] = await Promise.all([
        axios.get('/api/schools/current/invites'),
        axios.get('/api/schools/current/join-requests'),
      ]);
      setInvites(inviteRes.data.invites ?? []);
      setEmailConfigured(Boolean(inviteRes.data.emailConfigured));
      if (inviteRes.data.grades?.length) setGrades(inviteRes.data.grades);
      setRequests(requestRes.data.requests ?? []);
    } catch (err) {
      setError(errorText(err, 'Could not load invites.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (err) {
      setError(errorText(err, 'Something went wrong. Please try again.'));
    } finally {
      setBusy(null);
    }
  };

  const describe = (result: InviteResult) => {
    if (result.outcome === 'skipped') return { text: `${result.email} is already in your school.` };
    if (result.outcome === 'failed') return { text: `${result.email}: ${result.message ?? 'not sent'}` };
    return result.emailed
      ? { text: `Invite emailed to ${result.email}.`, url: result.inviteUrl }
      : { text: `Invite saved for ${result.email}, but email is not set up yet. Send them this link yourself.`, url: result.inviteUrl };
  };

  const sendInvite = (e: React.FormEvent) => {
    e.preventDefault();
    run('invite', async () => {
      const { data } = await axios.post('/api/schools/current/invites', {
        invites: [{ ...form, gradeLevel: form.role === 'student' ? form.gradeLevel : undefined }],
      });
      const result: InviteResult | undefined = data.results?.[0];
      if (result?.outcome === 'failed') {
        setError(result.message ?? 'Could not send the invite.');
        return;
      }
      if (result) setNotice(describe(result));
      setForm((f) => ({ ...f, email: '', name: '' }));
      await load();
    });
  };

  const resend = (invite: InviteRow) =>
    run(invite.id, async () => {
      const { data } = await axios.post(`/api/schools/current/invites/${invite.id}`);
      setNotice(describe(data.result));
      await load();
    });

  const cancel = (invite: InviteRow) =>
    run(invite.id, async () => {
      await axios.delete(`/api/schools/current/invites/${invite.id}`);
      await load();
    });

  const decide = (request: JoinRequest, approve: boolean) =>
    run(request.id, async () => {
      await axios.post(`/api/schools/current/join-requests/${request.id}`, { approve });
      setRequests((current) => current.filter((r) => r.id !== request.id));
      if (approve) onMembersChanged();
    });

  const setActive = (member: Member, isActive: boolean) =>
    run(member.id, async () => {
      await axios.patch(`/api/schools/current/members/${member.id}`, { isActive });
      onMembersChanged();
    });

  const openInvites = invites.filter((i) => i.state === 'pending' || i.state === 'expired');
  const shownInvites = showClosed ? invites : openInvites;
  const canChange = (member: Member) =>
    member.role !== 'owner' && member.user_id !== currentUserId && (member.role !== 'admin' || currentUserRole === 'owner');

  return (
    <div className="space-y-6">
      {error && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
      {notice && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/40 p-3 text-sm">
          <span>{notice.text}</span>
          {notice.url && <CopyLinkButton url={notice.url} />}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Invite people</CardTitle>
          <CardDescription>
            Each person gets an email with a link to join. Links work for 7 days.
            {!emailConfigured && ' Email sending is not set up yet, so you will get a link to share yourself.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={sendInvite} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_2fr_1fr_1fr_auto] lg:items-end">
            <div className="space-y-1">
              <Label htmlFor="invite-email">Email</Label>
              <Input id="invite-email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@school.edu" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="invite-name">Name (optional)</Label>
              <Input id="invite-name" value={form.name} maxLength={120} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="invite-role">Role</Label>
              <Select value={form.role} onValueChange={(role) => setForm({ ...form, role })}>
                <SelectTrigger id="invite-role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="teacher">Teacher</SelectItem>
                  <SelectItem value="student">Student</SelectItem>
                  <SelectItem value="admin">School admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="invite-grade">Grade</Label>
              <Select value={form.gradeLevel} onValueChange={(gradeLevel) => setForm({ ...form, gradeLevel })} disabled={form.role !== 'student'}>
                <SelectTrigger id="invite-grade"><SelectValue placeholder={form.role === 'student' ? 'Pick' : 'Not needed'} /></SelectTrigger>
                <SelectContent>
                  {grades.map((g) => <SelectItem key={g} value={g}>{gradeLevelLabel(g)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={busy !== null || !form.email || (form.role === 'student' && !form.gradeLevel)}>
              {busy === 'invite' ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="mr-1 h-4 w-4" />Invite</>}
            </Button>
          </form>
          <div className="mt-4">
            <Button variant="outline" size="sm" onClick={() => setCsvOpen(true)}>
              <FileUp className="mr-1 h-4 w-4" />Import a CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {requests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Students asking to join</CardTitle>
            <CardDescription>These students used a class code. They get access once you approve them.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y rounded-md border">
              {requests.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                  <div>
                    <p className="font-medium">{r.name || r.email}</p>
                    <p className="text-sm text-muted-foreground">
                      {r.email} · {gradeLevelLabel(r.gradeLevel)}{r.code ? ` · code ${r.code}` : ''}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => decide(r, true)} disabled={busy !== null}>
                      {busy === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Approve'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => decide(r, false)} disabled={busy !== null}>Decline</Button>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Invites</CardTitle>
              <CardDescription>{openInvites.length} waiting for an answer</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setShowClosed((v) => !v)}>
              {showClosed ? 'Hide joined and cancelled' : 'Show all'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : shownInvites.length === 0 ? (
            <p className="text-sm text-muted-foreground">No invites waiting.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Person</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shownInvites.map((invite) => (
                    <TableRow key={invite.id}>
                      <TableCell>
                        <div className="font-medium">{invite.name || invite.email}</div>
                        {invite.name && <div className="text-sm text-muted-foreground">{invite.email}</div>}
                      </TableCell>
                      <TableCell>
                        {inviteRoleLabel(invite.role)}
                        {invite.gradeLevel ? `, ${gradeLevelLabel(invite.gradeLevel)}` : ''}
                      </TableCell>
                      <TableCell>
                        <Badge variant={invite.state === 'pending' ? 'secondary' : 'outline'}>{STATE_LABEL[invite.state]}</Badge>
                        {invite.state === 'pending' && !invite.lastSentAt && (
                          <span className="ml-2 text-xs text-muted-foreground">not emailed</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {(invite.state === 'pending' || invite.state === 'expired') && (
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={() => resend(invite)} disabled={busy !== null}>
                              {busy === invite.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Resend'}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => cancel(invite)} disabled={busy !== null}>Cancel</Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <JoinCodesCard showCreator />

      <Card>
        <CardHeader>
          <CardTitle>People in your school</CardTitle>
          <CardDescription>Deactivating someone removes their access but keeps their lessons, homework and history.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Access</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <div className="font-medium">{m.users?.name}</div>
                      <div className="text-sm text-muted-foreground">{m.users?.email}</div>
                    </TableCell>
                    <TableCell>{m.role === 'owner' ? 'Owner' : inviteRoleLabel(m.role)}</TableCell>
                    <TableCell>
                      <Badge variant={m.is_active ? 'secondary' : 'outline'}>{m.is_active ? 'Active' : 'Deactivated'}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {canChange(m) && (
                        <Button size="sm" variant="ghost" onClick={() => setActive(m, !m.is_active)} disabled={busy !== null}>
                          {busy === m.id ? <Loader2 className="h-4 w-4 animate-spin" /> : m.is_active ? 'Deactivate' : 'Reactivate'}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <CsvInviteDialog open={csvOpen} onOpenChange={setCsvOpen} grades={grades} onSent={load} />
    </div>
  );
}
