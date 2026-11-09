'use client';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AnnouncementsBoard } from '@/components/notifications/AnnouncementsBoard';

export default function TeacherAnnouncementsPage() {
  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold sm:text-3xl">Announcements</h1>
        <p className="mt-1 text-muted-foreground">News from your school, and messages you post to your classes.</p>
      </div>
      <AnnouncementsBoard />
    </DashboardLayout>
  );
}
