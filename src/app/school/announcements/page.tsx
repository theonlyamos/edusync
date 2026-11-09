'use client';

import { AnnouncementsBoard } from '@/components/notifications/AnnouncementsBoard';
import { SchoolPageHeader } from '@/components/school-portal/SchoolPortalProvider';

export default function SchoolAnnouncementsPage() {
  return (
    <>
      <SchoolPageHeader title="Announcements" description="Tell the whole school, the teachers, a grade or one class." />
      <AnnouncementsBoard />
    </>
  );
}
