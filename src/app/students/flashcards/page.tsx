'use client';

import { Flashcards } from '@/components/flashcards/Flashcards';
import { DashboardLayout } from '@/components/layout/DashboardLayout';

export default function StudentFlashcardsPage() {
  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold sm:text-3xl">Flashcards</h1>
        <p className="mt-1 text-muted-foreground">Short daily reviews of the things you want to remember.</p>
      </div>
      <Flashcards />
    </DashboardLayout>
  );
}
