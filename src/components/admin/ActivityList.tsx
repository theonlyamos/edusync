'use client';

import Link from 'next/link';
import { describeAction, type ActivityRow } from '@/lib/platform-admin';
import { Empty, formatDateTime } from '@/components/admin/AdminParts';

/** Where an audit entry's target lives in the portal, if anywhere. */
function targetHref(row: ActivityRow): string | null {
  if (!row.targetId) return null;
  if (row.targetType === 'school') return `/admin/schools/${row.targetId}`;
  if (row.targetType === 'user') return `/admin/users/${row.targetId}`;
  if (row.targetType === 'organization') return `/admin/organizations/${row.targetId}`;
  return null;
}

/** Admin actions, newest first, with who did it and why. */
export function ActivityList({ rows, empty, linkTargets = false }: { rows: ActivityRow[]; empty: string; linkTargets?: boolean }) {
  if (rows.length === 0) return <Empty>{empty}</Empty>;
  return (
    <ul className="divide-y">
      {rows.map((row) => {
        const reason = typeof row.details?.reason === 'string' ? row.details.reason : null;
        const href = linkTargets ? targetHref(row) : null;
        const text = describeAction(row);
        return (
          <li key={row.id} className="px-4 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="min-w-0 break-words font-medium">
                {href ? <Link href={href} className="hover:underline">{text}</Link> : text}
              </p>
              <time dateTime={row.createdAt} className="shrink-0 text-xs text-muted-foreground">{formatDateTime(row.createdAt)}</time>
            </div>
            <p className="break-words text-sm text-muted-foreground">
              By {row.admin?.name || row.admin?.email || 'a removed admin'}
              {reason && <> · “{reason}”</>}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
