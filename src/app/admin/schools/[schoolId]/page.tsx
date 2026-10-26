'use client';

import Link from 'next/link';
import { use, useState } from 'react';
import { Coins, CalendarPlus, Crown, PauseCircle, PlayCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useHomeworkData } from '@/components/homework/shared';
import { NATIVE_SELECT_CLASS } from '@/components/school-portal/PersonFormDialog';
import { ActivityList } from '@/components/admin/ActivityList';
import { LedgerTable } from '@/components/admin/LedgerTable';
import { SchoolStatus } from '@/components/admin/SchoolStatus';
import { ActionDialog, AdminPageHeader, Detail, Empty, LoadState, Pill, StatTile, formatDate, n, plural, postJson, timeAgo } from '@/components/admin/AdminParts';
import { MAX_ADMIN_GRANT, MAX_TRIAL_EXTENSION_DAYS, ROLE_LABEL, monthLabel, type AdminSchoolDetail } from '@/lib/platform-admin';
import { gradeLevelLabel } from '@/lib/school-registration';

type Dialog = null | 'grant' | 'trial' | 'owner' | 'suspend' | 'reactivate';

export default function AdminSchoolPage({ params }: { params: Promise<{ schoolId: string }> }) {
  const { schoolId } = use(params);
  const school = useHomeworkData<AdminSchoolDetail>(`/api/admin/schools/${schoolId}`);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [credits, setCredits] = useState('');
  const [days, setDays] = useState('14');
  const [newOwner, setNewOwner] = useState('');
  const [notice, setNotice] = useState('');
  const s = school.data;

  const act = (body: Record<string, unknown>, done: string) => async (reason: string) => {
    await postJson(`/api/admin/schools/${schoolId}/actions`, { ...body, reason });
    setNotice(done);
    await school.refresh();
  };
  const owners = (s?.members ?? []).filter((m) => m.isActive && m.role !== 'student' && m.userId !== s?.owner?.id);

  return (
    <div>
      <AdminPageHeader
        back={{ href: '/admin/schools', label: 'Schools' }}
        title={s?.name ?? 'School'}
        description={s && <span className="flex flex-wrap items-center gap-2"><SchoolStatus school={s} />{s.isDefault && <Pill>Default school</Pill>}<span>Joined {formatDate(s.createdAt)}</span></span>}
        actions={s && (
          <>
            <Button onClick={() => setDialog('grant')}><Coins className="mr-2 h-4 w-4" aria-hidden />Give credits</Button>
            {s.credits.trialActive && <Button variant="outline" onClick={() => setDialog('trial')}><CalendarPlus className="mr-2 h-4 w-4" aria-hidden />Extend trial</Button>}
            <Button variant="outline" onClick={() => setDialog('owner')}><Crown className="mr-2 h-4 w-4" aria-hidden />Change owner</Button>
            {s.isActive
              ? !s.isDefault && <Button variant="outline" className="text-destructive" onClick={() => setDialog('suspend')}><PauseCircle className="mr-2 h-4 w-4" aria-hidden />Suspend</Button>
              : <Button variant="outline" onClick={() => setDialog('reactivate')}><PlayCircle className="mr-2 h-4 w-4" aria-hidden />Reactivate</Button>}
          </>
        )}
      />
      {notice && <p role="status" className="mb-4 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm">{notice}</p>}
      <LoadState loading={school.loading && !s} error={school.error} retry={school.refresh}>
        {s && (
          <div className="space-y-6">
            {!s.isActive && (
              <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
                This school is suspended. Its members can’t open the school portal, its lessons or its credits until you reactivate it.
              </p>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatTile
                label="Credits"
                value={n(s.credits.total)}
                detail={s.credits.trialActive ? `${n(s.credits.paid)} bought · ${n(s.credits.trial)} trial, ends ${formatDate(s.credits.trialExpiresAt)}` : `${n(s.purchased)} bought in total`}
              />
              <StatTile label="Students" value={n(s.students)} detail={`${plural(s.teachers, 'teacher')} · ${plural(s.admins, 'admin')}`} />
              <StatTile label="Lessons" value={n(s.lessons.total)} detail={`${n(s.lessons.published)} published`} />
              <StatTile label="Last activity" value={s.lastActivityAt ? timeAgo(s.lastActivityAt) : 'Not in 90 days'} detail={s.owner ? `Owner: ${s.owner.name || s.owner.email}` : undefined} />
            </div>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-lg">Details</CardTitle></CardHeader>
              <CardContent>
                <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                  <Detail label="Owner">{s.owner ? <Link className="hover:underline" href={`/admin/users/${s.owner.id}`}>{s.owner.name || s.owner.email}</Link> : '—'}{s.owner?.email && <span className="block break-all text-xs text-muted-foreground">{s.owner.email}</span>}</Detail>
                  <Detail label="Country">{s.country || '—'}</Detail>
                  <Detail label="Time zone">{s.timezone || '—'}</Detail>
                  <Detail label="Grades">{s.gradeLevels.length ? s.gradeLevels.map(gradeLevelLabel).join(', ') : '—'}</Detail>
                  {s.description && <Detail label="About">{s.description}</Detail>}
                </dl>
              </CardContent>
            </Card>

            <Tabs defaultValue="members">
              <TabsList className="flex h-auto flex-wrap justify-start">
                <TabsTrigger value="members">People ({s.members.length})</TabsTrigger>
                <TabsTrigger value="credits">Credits</TabsTrigger>
                <TabsTrigger value="usage">Usage</TabsTrigger>
                <TabsTrigger value="lessons">Lessons</TabsTrigger>
                <TabsTrigger value="activity">Admin activity</TabsTrigger>
              </TabsList>

              <TabsContent value="members">
                <Card>
                  <CardContent className="p-0">
                    {s.members.length === 0 ? <Empty>No one has joined yet.</Empty> : (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[36rem] text-sm">
                          <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                            <tr className="border-b"><th className="px-4 py-3 font-medium">Name</th><th className="px-3 py-3 font-medium">Role</th><th className="px-3 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Last sign-in</th></tr>
                          </thead>
                          <tbody className="divide-y">
                            {s.members.map((m) => (
                              <tr key={m.userId}>
                                <td className="px-4 py-3"><Link href={`/admin/users/${m.userId}`} className="font-medium hover:underline">{m.name || m.email || 'Unnamed'}</Link><p className="break-all text-xs text-muted-foreground">{m.email}</p></td>
                                <td className="px-3 py-3">{m.role === 'admin' ? 'Administrator' : ROLE_LABEL[m.role] ?? m.role}</td>
                                <td className="px-3 py-3">{m.isActive ? <Pill tone="good">Active</Pill> : <Pill>Deactivated</Pill>}</td>
                                <td className="px-4 py-3 text-muted-foreground">{timeAgo(m.lastLogin)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="credits">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">Credit history</CardTitle>
                    <CardDescription>Purchases, trials, grants and refunds. Day-to-day usage is on the Usage tab.</CardDescription>
                  </CardHeader>
                  <CardContent className="p-0"><LedgerTable rows={s.ledger} showBalance /></CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="usage">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">Usage by month</CardTitle>
                    <CardDescription>Credits spent on live AI, and lesson visuals and images made.</CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[32rem] text-sm">
                        <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                          <tr className="border-b"><th className="px-4 py-3 font-medium">Month</th><th className="px-3 py-3 text-right font-medium">AI tutor min</th><th className="px-3 py-3 text-right font-medium">Live class min</th><th className="px-3 py-3 text-right font-medium">Visuals</th><th className="px-4 py-3 text-right font-medium">Images</th></tr>
                        </thead>
                        <tbody className="divide-y">
                          {[...s.usage].reverse().map((m) => (
                            <tr key={m.month}>
                              <td className="px-4 py-3">{monthLabel(m.month)}</td>
                              <td className="px-3 py-3 text-right tabular-nums">{n(m.voice)}</td>
                              <td className="px-3 py-3 text-right tabular-nums">{n(m.liveClass)}</td>
                              <td className="px-3 py-3 text-right tabular-nums">{n(m.visuals)}</td>
                              <td className="px-4 py-3 text-right tabular-nums">{n(m.images)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="lessons">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">Lessons</CardTitle>
                    <CardDescription>The school’s 20 newest lessons. Teachers and the school manage them.</CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    {s.lessons.recent.length === 0 ? <Empty>No lessons yet.</Empty> : (
                      <ul className="divide-y">
                        {s.lessons.recent.map((l) => (
                          <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                            <div className="min-w-0"><p className="font-medium break-words">{l.title}</p><p className="text-xs text-muted-foreground">{[l.subject, formatDate(l.createdAt)].filter(Boolean).join(' · ')}</p></div>
                            {l.archived ? <Pill>Archived</Pill> : l.published ? <Pill tone="good">Published</Pill> : <Pill>Draft</Pill>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="activity">
                <Card><CardContent className="p-0"><ActivityList rows={s.activity} empty="No admin has changed this school yet." /></CardContent></Card>
              </TabsContent>
            </Tabs>

            <ActionDialog
              open={dialog === 'grant'}
              onOpenChange={(o) => setDialog(o ? 'grant' : null)}
              title={`Give ${s.name} credits`}
              description="They’re added to the school’s pool straight away and don’t expire. Nothing is charged."
              confirmLabel={`Give ${credits ? n(Number(credits) || 0) : ''} credits`.replace('  ', ' ')}
              canConfirm={Number.isInteger(Number(credits)) && Number(credits) >= 1 && Number(credits) <= MAX_ADMIN_GRANT}
              onConfirm={act({ action: 'grant_credits', credits: Number(credits) }, `Gave ${s.name} ${n(Number(credits))} credits.`)}
            >
              <div className="space-y-1.5">
                <Label htmlFor="grant-credits">Credits</Label>
                <Input id="grant-credits" type="number" inputMode="numeric" min={1} max={MAX_ADMIN_GRANT} value={credits} onChange={(e) => setCredits(e.target.value)} placeholder="e.g. 300" required />
                <p className="text-xs text-muted-foreground">1 credit = 1 minute of live AI.</p>
              </div>
            </ActionDialog>

            <ActionDialog
              open={dialog === 'trial'}
              onOpenChange={(o) => setDialog(o ? 'trial' : null)}
              title="Extend the trial"
              description={`The ${n(s.credits.trial)} trial credits left stay usable for longer. Trial ends ${formatDate(s.credits.trialExpiresAt)} now.`}
              confirmLabel="Extend trial"
              canConfirm={Number.isInteger(Number(days)) && Number(days) >= 1 && Number(days) <= MAX_TRIAL_EXTENSION_DAYS}
              onConfirm={act({ action: 'extend_trial', days: Number(days) }, `Extended ${s.name}'s trial by ${days} days.`)}
            >
              <div className="space-y-1.5">
                <Label htmlFor="trial-days">Extra days</Label>
                <Input id="trial-days" type="number" inputMode="numeric" min={1} max={MAX_TRIAL_EXTENSION_DAYS} value={days} onChange={(e) => setDays(e.target.value)} required />
              </div>
            </ActionDialog>

            <ActionDialog
              open={dialog === 'owner'}
              onOpenChange={(o) => setDialog(o ? 'owner' : null)}
              title="Change the owner"
              description="The new owner can add administrators and buy credits. The current owner stays on as an administrator."
              confirmLabel="Change owner"
              canConfirm={Boolean(newOwner)}
              onConfirm={act({ action: 'transfer_owner', userId: newOwner }, 'The school has a new owner.')}
            >
              {owners.length === 0 ? (
                <p className="text-sm text-muted-foreground">Only an active teacher or administrator of this school can become its owner. Ask the school to add them first.</p>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="new-owner">New owner</Label>
                  <select id="new-owner" className={NATIVE_SELECT_CLASS} value={newOwner} onChange={(e) => setNewOwner(e.target.value)} required>
                    <option value="">Pick someone</option>
                    {owners.map((m) => <option key={m.userId} value={m.userId}>{(m.name || m.email) + (m.email && m.name ? ` (${m.email})` : '')} · {m.role === 'admin' ? 'Administrator' : ROLE_LABEL[m.role] ?? m.role}</option>)}
                  </select>
                </div>
              )}
            </ActionDialog>

            <ActionDialog
              open={dialog === 'suspend'}
              onOpenChange={(o) => setDialog(o ? 'suspend' : null)}
              title={`Suspend ${s.name}?`}
              description="Its members won’t be able to open the school portal, the school’s lessons or its credits. Nothing is deleted, and you can reactivate it any time."
              confirmLabel="Suspend school"
              destructive
              onConfirm={act({ action: 'suspend' }, `${s.name} is suspended.`)}
            />
            <ActionDialog
              open={dialog === 'reactivate'}
              onOpenChange={(o) => setDialog(o ? 'reactivate' : null)}
              title={`Reactivate ${s.name}?`}
              description="Its members get their school back straight away."
              confirmLabel="Reactivate"
              onConfirm={act({ action: 'reactivate' }, `${s.name} is active again.`)}
            />
          </div>
        )}
      </LoadState>
    </div>
  );
}
