'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Loader2, NotebookText, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { homeworkRequest, useHomeworkData } from '@/components/homework/shared';
import { LoadError, Loading, Notice } from '@/components/records/shared';
import type { LessonNotes as Notes } from '@/lib/whiteboard/board';

// The notes view draws the whiteboard, which is only needed once a lesson is opened.
const LessonNotes = dynamic(() => import('@/components/learn/whiteboard/LessonNotes').then((mod) => mod.LessonNotes), { ssr: false });

type Summary = { id: string; topic: string; createdAt: string; boards: number; cards: number; checksCorrect: number; checksAnswered: number };
type Opened = Summary & { notes: Notes };

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const title = (item: Summary) => item.topic || 'Tutor lesson';

export function SavedLessonNotes() {
  const { toast } = useToast();
  const list = useHomeworkData<{ notes: Summary[] }>('/api/students/lesson-notes');
  const [opening, setOpening] = useState<string | null>(null);
  const [opened, setOpened] = useState<Opened | null>(null);
  const [removing, setRemoving] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);

  const open = async (item: Summary) => {
    if (opening) return;
    setOpening(item.id);
    try {
      setOpened(await homeworkRequest<Opened>(`/api/students/lesson-notes/${item.id}`));
    } catch (error) {
      toast({ title: (error as Error).message || 'Could not open these notes.', variant: 'destructive' });
    } finally {
      setOpening(null);
    }
  };

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      await homeworkRequest(`/api/students/lesson-notes/${removing.id}`, { method: 'DELETE' });
      setRemoving(null);
      await list.refresh();
    } catch (error) {
      toast({ title: (error as Error).message || 'Could not remove these notes.', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  if (list.loading && !list.data) return <Loading />;
  if (list.error || !list.data) return <LoadError message={list.error || 'Could not load your notes.'} retry={() => void list.refresh()} />;
  const items = list.data.notes;

  return (
    <div className="space-y-4">
      {items.length === 0 ? (
        <Notice>
          <NotebookText className="mx-auto mb-3 h-8 w-8" aria-hidden />
          <p>Your notes will show here after a lesson with the whiteboard tutor.</p>
          <Button asChild className="mt-4 min-h-11">
            <Link href="/students/lessons">Go to my lessons</Link>
          </Button>
        </Notice>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {items.map((item) => (
            <li key={item.id}>
              <Card className="h-full">
                <CardContent className="flex h-full flex-col gap-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="break-words font-medium">{title(item)}</p>
                      <p className="text-sm text-muted-foreground">{day(item.createdAt)}</p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label={`Remove notes: ${title(item)}, ${day(item.createdAt)}`} onClick={() => setRemoving(item)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {[
                      item.boards > 0 ? plural(item.boards, 'board') : null,
                      item.checksAnswered > 0 ? `${item.checksCorrect} of ${plural(item.checksAnswered, 'quick check')} right` : null,
                      item.cards > 0 ? plural(item.cards, 'review card') : null,
                    ].filter(Boolean).join(' · ')}
                  </p>
                  <Button variant="outline" className="mt-auto min-h-11 self-start" disabled={opening !== null} onClick={() => void open(item)}>
                    {opening === item.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
                    Open notes
                  </Button>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {opened && (
        <LessonNotes notes={opened.notes} topic={title(opened)} cardSubject={title(opened).slice(0, 80)} onClose={() => setOpened(null)} />
      )}

      <Dialog open={Boolean(removing)} onOpenChange={(isOpen) => { if (!isOpen) setRemoving(null); }}>
        <DialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove these notes?</DialogTitle>
            <DialogDescription className="break-words">
              {removing ? `${title(removing)}, ${day(removing.createdAt)}. ` : ''}They can&apos;t be brought back. Cards you added to your flashcards stay.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRemoving(null)} className="min-h-11">Keep them</Button>
            <Button variant="destructive" disabled={busy} onClick={remove} className="min-h-11">Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
