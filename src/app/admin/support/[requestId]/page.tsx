'use client';

import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useHomeworkData } from '@/components/homework/shared';
import { NATIVE_SELECT_CLASS } from '@/components/school-portal/PersonFormDialog';
import { AdminPageHeader, Detail, LoadState, formatDateTime } from '@/components/admin/AdminParts';
import { CategoryPill, Conversation, StatusPill, sendJson } from '@/components/support/SupportParts';
import { MAX_MESSAGE, SUPPORT_STATUSES, SUPPORT_STATUS_EVENT, type AdminSupportDetail, type SupportStatus } from '@/lib/support';
import { ROLE_LABEL } from '@/lib/platform-admin';
import { cn } from '@/lib/utils';

type Answer = { request: AdminSupportDetail; status: SupportStatus; emailed: 'sent' | 'not_configured' | 'failed' | 'no_email' | null };

const EMAIL_NOTICE: Record<string, string> = {
  sent: 'Reply sent and emailed to them.',
  not_configured: 'Reply saved. They’ll see it in Help & feedback, but no email went out because email isn’t set up (RESEND_API_KEY and EMAIL_FROM).',
  failed: 'Reply saved. They’ll see it in Help & feedback, but the email didn’t send.',
  no_email: 'Reply saved. They’ll see it in Help & feedback (their account has no email address).',
};

export default function AdminSupportRequestPage({ params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = use(params);
  const loaded = useHomeworkData<{ request: AdminSupportDetail }>(`/api/admin/support/${requestId}`);
  const request = loaded.data?.request;
  const [reply, setReply] = useState('');
  const [nextStatus, setNextStatus] = useState<SupportStatus | ''>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Opening a request marks it read, so the sidebar count should drop.
  useEffect(() => {
    if (request) window.dispatchEvent(new Event(SUPPORT_STATUS_EVENT));
  }, [request]);

  const submit = async (body: { message?: string; status?: SupportStatus }) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await sendJson<Answer>(`/api/admin/support/${requestId}`, 'PATCH', body);
      loaded.setData({ request: result.request });
      setNotice(body.message ? EMAIL_NOTICE[result.emailed ?? 'sent'] : `Marked as ${SUPPORT_STATUSES.find((s) => s.value === result.status)?.label.toLowerCase()}.`);
      if (body.message) setReply('');
      setNextStatus('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const sendReply = (event: React.FormEvent) => {
    event.preventDefault();
    if (!reply.trim()) return setError('Write a reply first.');
    void submit({ message: reply, ...(nextStatus ? { status: nextStatus } : {}) });
  };

  const person = request?.user;
  const personName = person?.name || person?.email || 'Deleted account';

  return (
    <div>
      <AdminPageHeader title={request?.subject ?? 'Support request'} back={{ href: '/admin/support', label: 'Support' }} />
      <LoadState loading={loaded.loading && !request} error={loaded.error} retry={loaded.refresh}>
        {request && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="min-w-0 space-y-6">
              <Conversation messages={request.messages} viewer="staff" personName={personName} />
              <form onSubmit={sendReply} className="space-y-3 rounded-xl border bg-card p-4">
                <Label htmlFor="support-reply">Reply to {personName}</Label>
                <Textarea id="support-reply" value={reply} maxLength={MAX_MESSAGE} onChange={(e) => setReply(e.target.value)} className="min-h-[140px]" />
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="support-next-status" className="text-xs text-muted-foreground">Then mark as</Label>
                    <select id="support-next-status" className={cn(NATIVE_SELECT_CLASS, 'w-48')} value={nextStatus} onChange={(e) => setNextStatus(e.target.value as SupportStatus | '')}>
                      <option value="">{request.status === 'open' ? 'In progress' : 'Keep current status'}</option>
                      {SUPPORT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                  <Button type="submit" disabled={busy} className="min-h-11 gap-2">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
                    Send reply
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">They’ll see it in Help &amp; feedback and get it by email.</p>
                {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                {notice && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">{notice}</p>}
              </form>
            </div>
            <aside className="space-y-4">
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-base">Request</CardTitle></CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div className="flex flex-wrap gap-2">
                    <StatusPill status={request.status} />
                    <CategoryPill category={request.category} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {SUPPORT_STATUSES.filter((s) => s.value !== request.status).map((s) => (
                      <Button key={s.value} type="button" variant="outline" size="sm" disabled={busy} onClick={() => void submit({ status: s.value })}>
                        Mark {s.label.toLowerCase()}
                      </Button>
                    ))}
                  </div>
                  <dl className="space-y-3">
                    <Detail label="Sent">{formatDateTime(request.createdAt)}</Detail>
                    {request.pagePath && <Detail label="From page"><code className="break-all text-xs">{request.pagePath}</code></Detail>}
                    {request.userAgent && <Detail label="Browser"><span className="text-xs text-muted-foreground">{request.userAgent}</span></Detail>}
                  </dl>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-base">From</CardTitle></CardHeader>
                <CardContent className="text-sm">
                  <dl className="space-y-3">
                    <Detail label="Person">
                      {person ? <Link href={`/admin/users/${person.id}`} className="font-medium hover:underline">{personName}</Link> : personName}
                    </Detail>
                    {person?.email && person.name && <Detail label="Email"><a href={`mailto:${person.email}`} className="break-all hover:underline">{person.email}</a></Detail>}
                    {person?.role && <Detail label="Role">{ROLE_LABEL[person.role] ?? person.role}</Detail>}
                    <Detail label="School">
                      {request.school ? <Link href={`/admin/schools/${request.school.id}`} className="hover:underline">{request.school.name}</Link> : 'No school'}
                    </Detail>
                  </dl>
                </CardContent>
              </Card>
            </aside>
          </div>
        )}
      </LoadState>
    </div>
  );
}
