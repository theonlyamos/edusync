'use client';

import { Suspense } from 'react';
import { PeopleManager } from '@/components/school-portal/PeopleManager';

export default function SchoolAdministratorsPage() {
  return (
    <Suspense fallback={null}>
      <PeopleManager role="admin" />
    </Suspense>
  );
}
