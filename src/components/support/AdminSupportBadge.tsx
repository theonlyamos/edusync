'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { SUPPORT_STATUS_EVENT } from '@/lib/support';

/** Requests support hasn't read yet. Refreshes on navigation, on focus and every 2 minutes. */
export function useAdminSupportUnread(enabled: boolean) {
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const load = () => {
      fetch('/api/admin/support/summary', { cache: 'no-store' })
        .then((res) => (res.ok ? res.json() : null))
        .then((body) => { if (active && typeof body?.unread === 'number') setUnread(body.unread); })
        .catch(() => { /* keep the last count */ });
    };
    load();
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    window.addEventListener(SUPPORT_STATUS_EVENT, load);
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') load(); }, 120_000);
    return () => {
      active = false;
      window.removeEventListener(SUPPORT_STATUS_EVENT, load);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
    };
  }, [enabled, pathname]);

  return enabled ? unread : 0;
}
