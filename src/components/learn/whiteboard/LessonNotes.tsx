'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Check, Layers, Loader2, Printer, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { LessonNotes as Notes } from '@/lib/whiteboard/board';
import { BoardSheet } from './Whiteboard';

type SaveState =
  | { status: 'idle' | 'saving' }
  | { status: 'saved'; added: number; skipped: number }
  | { status: 'failed'; message: string };

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/**
 * What the lesson left behind: every board the tutor wrote, the quick-check
 * score and the review cards. Opens over the tutor screen once a session ends.
 */
export function LessonNotes({ notes, topic, cardSubject, onClose }: {
  notes: Notes;
  topic: string | null;
  /** Set for signed-in students: the cards can be added to their flashcards under this subject. */
  cardSubject?: string;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const [save, setSave] = useState<SaveState>({ status: 'idle' });

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [onClose]);

  const saveCards = async () => {
    if (cardSubject === undefined || save.status === 'saving') return;
    setSave({ status: 'saving' });
    try {
      const response = await fetch('/api/students/flashcards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cards: notes.cards.map((card) => ({ subject: cardSubject, front: card.front, back: card.back })) }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setSave({ status: 'failed', message: typeof body.error === 'string' ? body.error : 'The cards could not be saved. Try again.' });
        return;
      }
      setSave({ status: 'saved', added: Number(body.added) || 0, skipped: Number(body.skipped) || 0 });
    } catch {
      setSave({ status: 'failed', message: 'The cards could not be saved. Check your connection and try again.' });
    }
  };

  const { score } = notes;

  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby="wb-notes-title" className="wb-notes fixed inset-0 z-50 overflow-y-auto bg-background text-foreground">
      <div className="wb-no-print sticky top-0 z-10 flex items-center gap-2 border-b bg-background/95 px-3 py-2 backdrop-blur sm:px-6">
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-muted-foreground">Lesson notes</p>
        <Button type="button" variant="outline" className="min-h-11" onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" aria-hidden /> Print or save as PDF
        </Button>
        <Button ref={closeRef} type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0" onClick={onClose} aria-label="Close notes">
          <X className="h-5 w-5" />
        </Button>
      </div>

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6 sm:px-6">
        <header>
          <h2 id="wb-notes-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">{topic || 'Your lesson'}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {[
              notes.pages.length > 0 ? plural(notes.pages.length, 'board') : null,
              score.answered > 0 ? `${score.correct} of ${plural(score.answered, 'quick check')} right` : null,
              notes.cards.length > 0 ? plural(notes.cards.length, 'review card') : null,
            ].filter(Boolean).join(' · ')}
          </p>
        </header>

        {notes.pages.map((page) => <BoardSheet key={page.id} page={page} />)}

        {notes.cards.length > 0 && (
          <section aria-labelledby="wb-notes-cards">
            <div className="flex flex-wrap items-center gap-3">
              <h3 id="wb-notes-cards" className="flex-1 text-lg font-semibold">Review cards</h3>
              {cardSubject !== undefined && save.status !== 'saved' && (
                <Button type="button" className="wb-no-print min-h-11" onClick={saveCards} disabled={save.status === 'saving'}>
                  {save.status === 'saving'
                    ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                    : <Layers className="mr-2 h-4 w-4" aria-hidden />}
                  Add to my flashcards
                </Button>
              )}
            </div>
            <div className="wb-no-print" aria-live="polite">
              {save.status === 'saved' && (
                <p className="mt-2 flex flex-wrap items-center gap-x-2 text-sm">
                  <Check className="h-4 w-4 text-green-600" aria-hidden />
                  {save.added > 0 ? `Added ${plural(save.added, 'card')}.` : 'You already have these cards.'}
                  {save.added > 0 && save.skipped > 0 && ` ${plural(save.skipped, 'card')} you already had.`}
                  <Link href="/students/flashcards" className="font-medium underline underline-offset-4">Open flashcards</Link>
                </p>
              )}
              {save.status === 'failed' && <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">{save.message}</p>}
            </div>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              {notes.cards.map((card, index) => (
                <div key={index} className="wb-notes-card rounded-xl border p-3">
                  <dt className="font-medium">{card.front}</dt>
                  <dd className="mt-1 text-sm text-muted-foreground">{card.back}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
      </div>
    </div>,
    document.body,
  );
}
