'use client';

import { Suspense } from 'react';
import { HelpCenter } from '@/components/support/HelpCenter';

/** Help & feedback inside the school admin portal. */
export default function SchoolHelpPage() {
  return (
    <Suspense fallback={null}>
      <HelpCenter portal="school" />
    </Suspense>
  );
}
