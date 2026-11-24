'use client';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { SavedLessonNotes } from '@/components/lesson-notes/SavedLessonNotes';

export default function StudentLessonNotesPage() {
  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold sm:text-3xl">Lesson notes</h1>
        <p className="mt-1 text-muted-foreground">What your tutor wrote on the whiteboard in each lesson, kept for you to look back at.</p>
      </div>
      <SavedLessonNotes />
    </DashboardLayout>
  );
}
