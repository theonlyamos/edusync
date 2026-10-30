'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { useHomeworkData } from '@/components/homework/shared';
import { NATIVE_SELECT_CLASS } from '@/components/school-portal/PersonFormDialog';
import { AdminPageHeader, LoadState } from '@/components/admin/AdminParts';
import { FeedbackList } from '@/components/admin/FeedbackList';
import type { FeedbackRow } from '@/lib/platform-admin';
import { cn } from '@/lib/utils';

export default function AdminFeedbackPage() {
  const [rating, setRating] = useState('');
  const feedback = useHomeworkData<{ feedback: FeedbackRow[] }>(`/api/admin/feedback${rating ? `?rating=${rating}` : ''}`);
  const rows = feedback.data?.feedback ?? [];

  return (
    <div>
      <AdminPageHeader
        title="Tutor ratings"
        back={{ href: '/admin/support', label: 'Support' }}
        description="What people said in the rating form after AI tutor sessions (shown on the demo). The latest 200 are shown."
        actions={
          <select aria-label="Rating" className={cn(NATIVE_SELECT_CLASS, 'w-44')} value={rating} onChange={(e) => setRating(e.target.value)}>
            <option value="">All ratings</option>
            <option value="negative">Poor</option>
            <option value="neutral">Okay</option>
            <option value="positive">Good</option>
          </select>
        }
      />
      <LoadState loading={feedback.loading && !feedback.data} error={feedback.error} retry={feedback.refresh}>
        <Card>
          <CardContent className="p-0">
            <FeedbackList rows={rows} empty={rating ? 'No feedback with that rating.' : 'No feedback yet.'} />
          </CardContent>
        </Card>
      </LoadState>
    </div>
  );
}
