'use client';

import { cn } from '@/lib/utils';
import { categoryLabel, statusLabel, type SupportMessage } from '@/lib/support';

const STATUS_TONE: Record<string, string> = {
  open: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  in_progress: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  resolved: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
};

export function StatusPill({ status }: { status: string }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium', STATUS_TONE[status] ?? 'bg-muted text-muted-foreground')}>
      {statusLabel(status)}
    </span>
  );
}

export function CategoryPill({ category }: { category: string }) {
  return <span className="inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs text-muted-foreground">{categoryLabel(category)}</span>;
}

export function UnreadDot({ label }: { label: string }) {
  return <span className="h-2 w-2 shrink-0 rounded-full bg-primary" role="img" aria-label={label} />;
}

export function formatWhen(value: string) {
  return new Date(value).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/**
 * The messages on a request, oldest first. `viewer` decides whose messages sit
 * on the right and how the other side is named.
 */
export function Conversation({ messages, viewer, personName }: { messages: SupportMessage[]; viewer: 'person' | 'staff'; personName?: string }) {
  return (
    <ol className="space-y-3" aria-label="Conversation">
      {messages.map((m) => {
        const mine = viewer === 'staff' ? m.fromStaff : !m.fromStaff;
        const who = m.fromStaff
          ? viewer === 'staff' ? (m.author?.name || m.author?.email || 'Support') : 'InsyteAI team'
          : viewer === 'staff' ? (personName || 'Them') : 'You';
        return (
          <li key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
            <div className={cn('max-w-[min(36rem,92%)] rounded-xl border px-4 py-3', mine ? 'bg-primary/10 border-primary/20' : 'bg-card')}>
              <p className="mb-1 flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{who}</span>
                <time dateTime={m.createdAt}>{formatWhen(m.createdAt)}</time>
              </p>
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{m.body}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** JSON request that throws the server's error message. */
export async function sendJson<T = unknown>(url: string, method: 'POST' | 'PATCH', body: unknown): Promise<T> {
  const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? data?.message ?? 'That didn’t work. Please try again.');
  return data as T;
}
