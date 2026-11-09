'use client';

import { useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, CalendarClock, CheckCheck, CreditCard, FileCheck, Megaphone } from 'lucide-react';
import { AppUserContext } from '@/components/providers/SupabaseAuthProvider';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { timeAgo, type AppNotification, type NotificationFeed, type NotificationKind } from '@/lib/notifications';
import { cn } from '@/lib/utils';

// One feed for every bell on the page (the phone header and the sidebar each
// show one), so they stay in step and only one request goes out at a time.
const EMPTY: NotificationFeed = { notifications: [], unread: 0 };
let feed: NotificationFeed = EMPTY;
let pending: Promise<void> | null = null;
let lastLoaded = 0;
/** Whose feed this is, so a different person signing in on this tab never sees it. */
let owner: string | null = null;
const listeners = new Set<() => void>();

function setFeed(next: NotificationFeed) {
  feed = next;
  listeners.forEach((listener) => listener());
}

function isFeed(body: unknown): body is NotificationFeed {
  return Boolean(body) && Array.isArray((body as NotificationFeed).notifications) && typeof (body as NotificationFeed).unread === 'number';
}

function loadFeed(force = false): Promise<void> {
  if (pending) return pending;
  if (!force && Date.now() - lastLoaded < 15_000) return Promise.resolve();
  pending = fetch('/api/notifications', { cache: 'no-store' })
    .then((res) => (res.ok ? res.json() : null))
    .then((body) => { if (isFeed(body)) { lastLoaded = Date.now(); setFeed(body); } })
    .catch(() => { /* keep the last feed */ })
    .finally(() => { pending = null; });
  return pending;
}

async function markRead(body: { all: true } | { ids: string[] }) {
  // Show it as read straight away; the reply brings the true state.
  const now = new Date().toISOString();
  const ids = 'ids' in body ? new Set(body.ids) : null;
  const notifications = feed.notifications.map((n) => (!n.readAt && (!ids || ids.has(n.id)) ? { ...n, readAt: now } : n));
  const cleared = feed.notifications.filter((n) => !n.readAt && (!ids || ids.has(n.id))).length;
  setFeed({ notifications, unread: ids ? Math.max(0, feed.unread - cleared) : 0 });
  try {
    const res = await fetch('/api/notifications', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const fresh = res.ok ? await res.json() : null;
    if (isFeed(fresh)) setFeed(fresh);
    else void loadFeed(true);
  } catch {
    void loadFeed(true);
  }
}

function useNotificationFeed(): NotificationFeed {
  const userId = useContext(AppUserContext).user?.id ?? null;
  const value = useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    () => feed,
    () => EMPTY,
  );
  useEffect(() => {
    if (!userId) return;
    if (owner !== userId) {
      owner = userId;
      lastLoaded = 0;
      setFeed(EMPTY);
    }
    void loadFeed();
    const onVisible = () => { if (document.visibilityState === 'visible') void loadFeed(); };
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void loadFeed(); }, 120_000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
    };
  }, [userId]);
  return value;
}

const KIND_ICON: Record<NotificationKind, typeof Bell> = {
  announcement: Megaphone,
  homework_assigned: FileCheck,
  homework_submitted: FileCheck,
  homework_returned: FileCheck,
  live_class_scheduled: CalendarClock,
  low_credits: CreditCard,
};

/** The bell with an unread count, opening the person's latest notifications. */
export function NotificationBell({ className, align = 'end' }: { className?: string; align?: 'start' | 'end' }) {
  const router = useRouter();
  const { notifications, unread } = useNotificationFeed();
  const [open, setOpen] = useState(false);
  const label = unread ? `Notifications, ${unread} unread` : 'Notifications';

  const openItem = (item: AppNotification) => {
    if (!item.readAt) void markRead({ ids: [item.id] });
    if (item.href) router.push(item.href);
  };

  return (
    <DropdownMenu open={open} onOpenChange={(next) => { setOpen(next); if (next) void loadFeed(true); }}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={label} title={label} className={cn('relative h-11 w-11 shrink-0 text-muted-foreground hover:text-foreground', className)}>
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span aria-hidden className="absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold tabular-nums leading-none text-primary-foreground">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-[min(22rem,calc(100vw-1.5rem))] p-0">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <p className="text-sm font-semibold">Notifications</p>
          {unread > 0 && (
            <DropdownMenuItem
              className="h-8 cursor-pointer gap-1.5 px-2 text-xs"
              onSelect={(event) => { event.preventDefault(); void markRead({ all: true }); }}
            >
              <CheckCheck className="h-4 w-4" /> Mark all read
            </DropdownMenuItem>
          )}
        </div>
        {notifications.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">Nothing yet. Homework, announcements and class news will show up here.</p>
        ) : (
          <div className="max-h-[min(26rem,70dvh)] overflow-y-auto overscroll-contain py-1">
            {notifications.map((item) => {
              const Icon = KIND_ICON[item.kind] ?? Bell;
              return (
                <DropdownMenuItem
                  key={item.id}
                  // Stay open when there is nowhere to go, so the list doesn't vanish on a tap.
                  onSelect={(event) => { if (!item.href) event.preventDefault(); openItem(item); }}
                  className={cn('cursor-pointer items-start gap-3 rounded-none px-3 py-2.5', !item.readAt && 'bg-primary/5')}
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className={cn('block break-words text-sm', !item.readAt && 'font-semibold')}>{item.title}</span>
                    {item.body && <span className="mt-0.5 line-clamp-2 block break-words text-xs text-muted-foreground">{item.body}</span>}
                    <span className="mt-0.5 block text-xs text-muted-foreground">{timeAgo(item.createdAt)}</span>
                  </span>
                  {!item.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary"><span className="sr-only">Unread</span></span>}
                </DropdownMenuItem>
              );
            })}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
