'use client';

import Link from 'next/link';
import { use, useState } from 'react';
import { Coins, KeyRound, ShieldCheck, UserCheck, UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useHomeworkData } from '@/components/homework/shared';
import { ActivityList } from '@/components/admin/ActivityList';
import { FeedbackList } from '@/components/admin/FeedbackList';
import { LedgerTable } from '@/components/admin/LedgerTable';
import { ActionDialog, AdminPageHeader, Detail, Empty, LoadState, Pill, StatTile, formatDate, formatDateTime, n, postJson, timeAgo } from '@/components/admin/AdminParts';
import { MAX_ADMIN_GRANT, ROLE_LABEL, adminPromotionProblem, type AdminUserDetail } from '@/lib/platform-admin';

type Dialog = null | 'reset' | 'grant' | 'deactivate' | 'reactivate' | 'admin';

const SCHOOL_ROLE: Record<string, string> = { owner: 'Owner', admin: 'Administrator', teacher: 'Teacher', student: 'Student' };

export default function AdminUserPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = use(params);
  const user = useHomeworkData<AdminUserDetail>(`/api/admin/users/${userId}`);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [credits, setCredits] = useState('');
  const [notice, setNotice] = useState('');
  const u = user.data;

  const act = (body: Record<string, unknown>, done: string) => async (reason: string) => {
    await postJson(`/api/admin/users/${userId}/actions`, { ...body, reason });
    setNotice(done);
    await user.refresh();
  };
  const sendReset = async () => {
    const result = await postJson<{ email: string }>(`/api/admin/users/${userId}/password-reset`, {});
    setNotice(`Sent a password reset link to ${result.email}.`);
    await user.refresh();
  };
  const makeAdmin = async () => {
    await postJson('/api/admin/users/admins', { email: u?.email });
    setNotice(`${u?.email} is now a platform admin.`);
    await user.refresh();
  };
  const canPromote = u ? !adminPromotionProblem(u.role) && !u.school : false;
  const grantAmount = Number(credits);
  const grantValid = Number.isInteger(grantAmount) && grantAmount >= 1 && grantAmount <= MAX_ADMIN_GRANT;
  const display = u ? u.name || u.email || 'Unnamed account' : 'Account';

  return (
    <div>
      <AdminPageHeader
        back={{ href: '/admin/users', label: 'Users' }}
        title={display}
        description={u && (
          <span className="flex flex-wrap items-center gap-2">
            <Pill>{ROLE_LABEL[u.role] ?? u.role}</Pill>
            {u.isActive ? <Pill tone="good">Active</Pill> : <Pill tone="bad">Deactivated</Pill>}
            {u.name && <span className="break-all">{u.email}</span>}
          </span>
        )}
        actions={u && (
          <>
            <Button variant="outline" onClick={() => setDialog('reset')} disabled={!u.email}><KeyRound className="mr-2 h-4 w-4" aria-hidden />Send password reset</Button>
            <Button variant="outline" onClick={() => setDialog('grant')}><Coins className="mr-2 h-4 w-4" aria-hidden />Give credits</Button>
            {canPromote && <Button variant="outline" onClick={() => setDialog('admin')}><ShieldCheck className="mr-2 h-4 w-4" aria-hidden />Make platform admin</Button>}
            {u.role !== 'admin' && (u.isActive
              ? <Button variant="outline" className="text-destructive" onClick={() => setDialog('deactivate')}><UserX className="mr-2 h-4 w-4" aria-hidden />Deactivate</Button>
              : <Button variant="outline" onClick={() => setDialog('reactivate')}><UserCheck className="mr-2 h-4 w-4" aria-hidden />Reactivate</Button>)}
          </>
        )}
      />
      {notice && <p role="status" className="mb-4 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm">{notice}</p>}
      <LoadState loading={user.loading && !u} error={user.error} retry={user.refresh}>
        {u && (
          <div className="space-y-6">
            {!u.isActive && (
              <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
                This account can’t sign in. Their school place and work are kept until you reactivate it.
              </p>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatTile label="Own credits" value={n(u.credits)} detail={u.school ? 'Their AI tutor uses school credits' : `${n(u.purchased)} bought · ${n(u.used)} used`} />
              <StatTile label="Tutor sessions" value={n(u.sessions.length)} detail={u.sessions.length >= 20 ? 'Latest 20 shown' : undefined} />
              <StatTile label="Last sign-in" value={timeAgo(u.lastLogin)} />
              <StatTile label="Joined" value={formatDate(u.createdAt)} />
            </div>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-lg">Details</CardTitle></CardHeader>
              <CardContent>
                <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                  <Detail label="Email"><span className="break-all">{u.email || '—'}</span></Detail>
                  <Detail label="Account type">{ROLE_LABEL[u.role] ?? u.role}</Detail>
                  <Detail label="School">
                    {u.school ? (
                      <>
                        <Link href={`/admin/schools/${u.school.id}`} className="hover:underline">{u.school.name}</Link>
                        <span className="block text-xs text-muted-foreground">{SCHOOL_ROLE[u.school.role] ?? u.school.role}</span>
                      </>
                    ) : 'Not in a school'}
                  </Detail>
                </dl>
              </CardContent>
            </Card>

            <Tabs defaultValue="sessions">
              <TabsList className="flex h-auto flex-wrap justify-start">
                <TabsTrigger value="sessions">Tutor sessions</TabsTrigger>
                <TabsTrigger value="credits">Credits</TabsTrigger>
                <TabsTrigger value="feedback">Feedback ({u.feedback.length})</TabsTrigger>
                <TabsTrigger value="activity">Admin activity</TabsTrigger>
              </TabsList>
              <TabsContent value="sessions">
                <Card>
                  <CardContent className="p-0">
                    {u.sessions.length === 0 ? <Empty>No tutor sessions yet.</Empty> : (
                      <ul className="divide-y">
                        {u.sessions.map((session) => (
                          <li key={session.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm">
                            <span className="min-w-0 break-words font-medium">{session.topic || 'Untitled session'}{session.embedded && <span className="ml-2"><Pill>Embedded</Pill></span>}</span>
                            <span className="text-xs text-muted-foreground">{formatDateTime(session.createdAt)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="credits">
                <Card><CardContent className="p-0"><LedgerTable rows={u.ledger} /></CardContent></Card>
              </TabsContent>
              <TabsContent value="feedback">
                <Card><CardContent className="p-0"><FeedbackList rows={u.feedback} empty="They haven’t left feedback." showUser={false} /></CardContent></Card>
              </TabsContent>
              <TabsContent value="activity">
                <Card><CardContent className="p-0"><ActivityList rows={u.activity} empty="No admin has changed this account yet." /></CardContent></Card>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </LoadState>

      {u && (
        <>
          <ActionDialog
            open={dialog === 'reset'}
            onOpenChange={(open) => setDialog(open ? 'reset' : null)}
            title="Send a password reset?"
            description={<>We’ll email a link to <span className="break-all font-medium">{u.email}</span>. Only they can use it; you never see it.</>}
            confirmLabel="Send link"
            needsReason={false}
            onConfirm={sendReset}
          />
          <ActionDialog
            open={dialog === 'grant'}
            onOpenChange={(open) => {
              setDialog(open ? 'grant' : null);
              if (!open) setCredits('');
            }}
            title={`Give ${display} credits`}
            description={u.school ? `These go to their own balance. Their AI tutor uses ${u.school.name}’s credits, so to help with tutor time, give credits to the school instead.` : 'Free credits on their own balance. One credit is one AI tutor minute.'}
            confirmLabel={grantValid ? `Give ${n(grantAmount)} credits` : 'Give credits'}
            canConfirm={grantValid}
            onConfirm={act({ action: 'grant_credits', credits: grantAmount }, `Gave ${n(grantAmount)} credits.`)}
          >
            <div className="space-y-1.5">
              <Label htmlFor="grant-credits">Credits</Label>
              <Input id="grant-credits" inputMode="numeric" type="number" min={1} max={MAX_ADMIN_GRANT} step={1} value={credits} onChange={(e) => setCredits(e.target.value)} required />
            </div>
          </ActionDialog>
          <ActionDialog
            open={dialog === 'deactivate'}
            onOpenChange={(open) => setDialog(open ? 'deactivate' : null)}
            title={`Deactivate ${display}?`}
            description="They’ll be signed out and can’t sign in. Their school place, lessons and work stay, and you can reactivate them at any time."
            confirmLabel="Deactivate"
            destructive
            onConfirm={act({ action: 'deactivate' }, 'Deactivated. They can no longer sign in.')}
          />
          <ActionDialog
            open={dialog === 'reactivate'}
            onOpenChange={(open) => setDialog(open ? 'reactivate' : null)}
            title={`Reactivate ${display}?`}
            description="They’ll be able to sign in again with their existing password."
            confirmLabel="Reactivate"
            onConfirm={act({ action: 'reactivate' }, 'Reactivated. They can sign in again.')}
          />
          <ActionDialog
            open={dialog === 'admin'}
            onOpenChange={(open) => setDialog(open ? 'admin' : null)}
            title={`Make ${display} a platform admin?`}
            description="They’ll be able to see every school and account, give credits and suspend schools. You can remove this on the Admins page."
            confirmLabel="Make admin"
            needsReason={false}
            onConfirm={makeAdmin}
          />
        </>
      )}
    </div>
  );
}
