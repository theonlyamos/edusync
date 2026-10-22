'use client';

import { Suspense } from 'react';
import { PeopleManager } from '@/components/school-portal/PeopleManager';

export default function SchoolTeachersPage() {
  return (
    <Suspense fallback={null}>
      <PeopleManager role="teacher" />
    </Suspense>
  );
}
