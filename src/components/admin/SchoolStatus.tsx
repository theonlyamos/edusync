'use client';

import { useState } from 'react';
import { Pill } from '@/components/admin/AdminParts';
import { TRIAL_ENDING_DAYS, type AdminSchoolRow } from '@/lib/platform-admin';

/** Suspended, on a trial (with days left), low on credits, or paying. */
export function SchoolStatus({ school: s }: { school: Pick<AdminSchoolRow, 'isActive' | 'credits'> }) {
  const [now] = useState(() => Date.now());
  if (!s.isActive) return <Pill tone="bad">Suspended</Pill>;
  if (s.credits.trialActive) {
    const days = s.credits.trialExpiresAt ? Math.max(0, Math.ceil((Date.parse(s.credits.trialExpiresAt) - now) / 86_400_000)) : null;
    return <Pill tone={days !== null && days <= TRIAL_ENDING_DAYS ? 'warn' : 'muted'}>Trial{days !== null ? ` · ${days}d left` : ''}</Pill>;
  }
  if (s.credits.low) return <Pill tone="warn">Low credits</Pill>;
  return <Pill tone="good">Has credits</Pill>;
}
