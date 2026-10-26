'use client';

import { Card, CardContent } from '@/components/ui/card';
import { useHomeworkData } from '@/components/homework/shared';
import { AdminPageHeader, LoadState } from '@/components/admin/AdminParts';
import { ActivityList } from '@/components/admin/ActivityList';
import type { ActivityRow } from '@/lib/platform-admin';

export default function AdminActivityPage() {
  const activity = useHomeworkData<{ activity: ActivityRow[] }>('/api/admin/activity');
  return (
    <div>
      <AdminPageHeader
        title="Activity log"
        description="Every change a platform admin made to a school or account: credits given, trials extended, suspensions, owner changes, password resets and admin access. The latest 500 are shown."
      />
      <LoadState loading={activity.loading && !activity.data} error={activity.error} retry={activity.refresh}>
        <Card>
          <CardContent className="p-0">
            <ActivityList rows={activity.data?.activity ?? []} empty="No admin actions yet." linkTargets />
          </CardContent>
        </Card>
      </LoadState>
    </div>
  );
}
