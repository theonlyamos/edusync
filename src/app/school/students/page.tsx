'use client';

import { Suspense } from 'react';
import { PeopleManager } from '@/components/school-portal/PeopleManager';

export default function SchoolStudentsPage() {
  return (
    <Suspense fallback={null}>
      <PeopleManager role="student" />
    </Suspense>
  );
}
