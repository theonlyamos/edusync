'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import SchoolBilling from '@/components/school-portal/SchoolBilling';
import { SchoolPageHeader } from '@/components/school-portal/SchoolPortalProvider';

function BillingContent() {
  const searchParams = useSearchParams();
  return (
    <>
      <SchoolPageHeader title="Billing" description="Your school’s credits, what they were spent on, and buying more." />
      <SchoolBilling purchased={searchParams?.get('purchase') === 'success'} />
    </>
  );
}

export default function SchoolBillingPage() {
  return (
    <Suspense fallback={null}>
      <BillingContent />
    </Suspense>
  );
}
