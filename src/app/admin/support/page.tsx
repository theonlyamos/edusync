'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { useHomeworkData } from '@/components/homework/shared';
import { NATIVE_SELECT_CLASS } from '@/components/school-portal/PersonFormDialog';
import { AdminPageHeader, Empty, LoadState, StatTile, n, timeAgo } from '@/components/admin/AdminParts';
import { CategoryPill, StatusPill, UnreadDot } from '@/components/support/SupportParts';
import { SUPPORT_CATEGORIES, SUPPORT_STATUSES, type AdminSupportRow, type SupportSummary } from '@/lib/support';
import { ROLE_LABEL } from '@/lib/platform-admin';
import { cn } from '@/lib/utils';

export default function AdminSupportPage() {
  const [status, setStatus] = useState('active');
  const [category, setCategory] = useState('');
  const query = new URLSearchParams({ ...(status ? { status } : {}), ...(category ? { category } : {}) }).toString();
  const data = useHomeworkData<{ requests: AdminSupportRow[]; summary: SupportSummary }>(`/api/admin/support${query ? `?${query}` : ''}`);
  const rows = data.data?.requests ?? [];
  const summary = data.data?.summary;

  return (
    <div>
      <AdminPageHeader
        title="Support"
        description={<>Problems, feature requests, complaints and questions people send from Help &amp; feedback. <Link href="/admin/feedback" className="underline underline-offset-2 hover:text-foreground">Tutor session ratings</Link> are on their own page.</>}
        actions={
          <>
            <select aria-label="Status" className={cn(NATIVE_SELECT_CLASS, 'w-44')} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="active">Open and in progress</option>
              {SUPPORT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              <option value="">All requests</option>
            </select>
            <select aria-label="Category" className={cn(NATIVE_SELECT_CLASS, 'w-44')} value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All topics</option>
              {SUPPORT_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.short}</option>)}
            </select>
          </>
        }
      />
      {summary && (
        <div className="mb-6 grid grid-cols-3 gap-3">
          <StatTile label="Unread" value={n(summary.unread)} />
          <StatTile label="Open" value={n(summary.open)} />
          <StatTile label="In progress" value={n(summary.inProgress)} />
        </div>
      )}
      <LoadState loading={data.loading && !data.data} error={data.error} retry={data.refresh}>
        <Card>
          <CardContent className="p-0">
            {rows.length === 0 ? (
              <Empty>{status === 'active' && !category ? 'Nothing waiting. New requests will show up here.' : 'No requests match these filters.'}</Empty>
            ) : (
              <ul className="divide-y">
                {rows.map((r) => (
                  <li key={r.id}>
                    <Link href={`/admin/support/${r.id}`} className="flex flex-col gap-1.5 px-4 py-3 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none">
                      <span className="flex items-center gap-2">
                        {r.unread && <UnreadDot label="Unread" />}
                        <span className={cn('min-w-0 flex-1 truncate', r.unread ? 'font-semibold' : 'font-medium')}>{r.subject}</span>
                        <time dateTime={r.lastMessageAt} className="shrink-0 text-xs text-muted-foreground">{timeAgo(r.lastMessageAt)}</time>
                      </span>
                      {r.preview && <span className="line-clamp-2 break-words text-sm text-muted-foreground">{r.preview}</span>}
                      <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <StatusPill status={r.status} />
                        <CategoryPill category={r.category} />
                        <span className="break-all">
                          {r.user ? (r.user.name || r.user.email) : 'Deleted account'}
                          {r.user?.role ? ` · ${ROLE_LABEL[r.user.role] ?? r.user.role}` : ''}
                          {r.schoolName ? ` · ${r.schoolName}` : ''}
                        </span>
                        {r.messageCount > 1 && <span>{r.messageCount} messages</span>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </LoadState>
    </div>
  );
}
