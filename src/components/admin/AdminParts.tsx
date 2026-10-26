'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { MAX_REASON, change } from '@/lib/platform-admin';
import { cn } from '@/lib/utils';

export const n = (value: number) => value.toLocaleString();

/** "1 teacher", "3 teachers". */
export const plural = (count: number, word: string, many = `${word}s`) => `${n(count)} ${count === 1 ? word : many}`;

export function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** "3 days ago", or "Never". */
export function timeAgo(value: string | null | undefined, now: Date = new Date()) {
  if (!value) return 'Never';
  const minutes = Math.round((now.getTime() - Date.parse(value)) / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 31) return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  return formatDate(value);
}

export function AdminPageHeader({ title, description, actions, back }: { title: string; description?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-6 space-y-2">
      {back && (
        <Link href={back.href} className="text-sm text-muted-foreground hover:text-foreground">
          ← {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-bold sm:text-3xl">{title}</h1>
          {description && <div className="mt-1 text-muted-foreground">{description}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/** A number with an optional month-on-month change. */
export function StatTile({ label, value, detail, href, now, before }: { label: string; value: ReactNode; detail?: ReactNode; href?: string; now?: number; before?: number }) {
  const pct = now !== undefined && before !== undefined ? change(now, before) : undefined;
  const body = (
    <>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="my-1 text-2xl font-medium tabular-nums">{value}</p>
      <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
        {pct !== undefined && pct !== null && pct !== 0 && (
          <span className={cn('inline-flex items-center', pct > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400')}>
            {pct > 0 ? <ArrowUpRight className="h-3 w-3" aria-hidden /> : <ArrowDownRight className="h-3 w-3" aria-hidden />}
            {Math.abs(pct)}% vs last month
          </span>
        )}
        {detail && <span>{detail}</span>}
      </div>
    </>
  );
  const cls = 'min-w-0 break-words rounded-lg border bg-card p-4';
  return href ? (
    <Link href={href} className={cn(cls, 'transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring')}>{body}</Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Loading spinner, error with retry, or the content. */
export function LoadState({ loading, error, retry, children }: { loading: boolean; error?: string; retry?: () => void; children: ReactNode }) {
  if (loading) {
    return (
      <div role="status" className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Loading…
      </div>
    );
  }
  if (error) {
    return (
      <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-xl border border-dashed p-8 text-center">
        <AlertTriangle className="h-8 w-8 text-amber-500" aria-hidden />
        <p className="text-sm text-muted-foreground">{error}</p>
        {retry && <Button variant="outline" onClick={retry}>Try again</Button>}
      </div>
    );
  }
  return <>{children}</>;
}

/** A label and value in a details card. */
export function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

export function Pill({ tone = 'muted', children }: { tone?: 'muted' | 'good' | 'warn' | 'bad'; children: ReactNode }) {
  const tones = {
    muted: 'bg-muted text-muted-foreground',
    good: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    warn: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
    bad: 'bg-red-500/15 text-red-700 dark:text-red-300',
  };
  return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', tones[tone])}>{children}</span>;
}

/**
 * A support action that changes money or access: asks for a reason (and any
 * extra fields), sends it, and shows the server's error in place.
 */
export function ActionDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive,
  children,
  onConfirm,
  canConfirm = true,
  needsReason = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  children?: ReactNode;
  onConfirm: (reason: string) => Promise<void>;
  canConfirm?: boolean;
  /** False for actions that don't change money or access, like sending a reset email. */
  needsReason?: boolean;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const close = (next: boolean) => {
    if (busy) return;
    if (!next) {
      setReason('');
      setError('');
    }
    onOpenChange(next);
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onConfirm(reason.trim());
      setReason('');
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t work. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {children}
          {needsReason && (
            <div className="space-y-1.5">
              <Label htmlFor="admin-action-reason">Reason</Label>
              <Textarea id="admin-action-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={MAX_REASON} rows={2} placeholder="e.g. Pilot school, agreed on a call" required />
              <p className="text-xs text-muted-foreground">Saved in the activity log.</p>
            </div>
          )}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(false)} disabled={busy}>Cancel</Button>
            <Button type="submit" variant={destructive ? 'destructive' : 'default'} disabled={busy || (needsReason && !reason.trim()) || !canConfirm}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** POSTs JSON and throws the server's error message on failure. */
export async function postJson<T = unknown>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? 'That didn’t work. Please try again.');
  return data as T;
}
