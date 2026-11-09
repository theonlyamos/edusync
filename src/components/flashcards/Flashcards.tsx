'use client';

import { useMemo, useState } from 'react';
import { Check, Layers, Loader2, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { homeworkRequest, useHomeworkData } from '@/components/homework/shared';
import { LoadError, Loading, Notice } from '@/components/records/shared';
import { FLASHCARD_BACK_MAX, FLASHCARD_BOXES, FLASHCARD_FRONT_MAX, FLASHCARD_SUBJECT_MAX, dueCards, dueLabel, type Flashcard } from '@/lib/flashcards';
import { cn } from '@/lib/utils';

type Data = { cards: Flashcard[]; today: string };

/** One pass through the cards that are due: show the question, reveal the answer, say how it went. */
function Review({ queue, onDone }: { queue: Flashcard[]; onDone: (remembered: number) => void }) {
  const { toast } = useToast();
  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState(false);
  const [saving, setSaving] = useState(false);
  const [remembered, setRemembered] = useState(0);
  const card = queue[index];

  const answer = async (knew: boolean) => {
    setSaving(true);
    try {
      await homeworkRequest(`/api/students/flashcards/${card.id}`, { method: 'PATCH', body: JSON.stringify({ remembered: knew }) });
      const total = remembered + (knew ? 1 : 0);
      setRemembered(total);
      if (index + 1 >= queue.length) return onDone(total);
      setIndex(index + 1);
      setShown(false);
    } catch (error) {
      toast({ title: (error as Error).message || 'Could not save that answer.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <p aria-live="polite">Card {index + 1} of {queue.length}</p>
        <Button variant="ghost" onClick={() => onDone(remembered)} className="min-h-11">Stop for now</Button>
      </div>
      <Card>
        <CardContent className="space-y-5 p-5 sm:p-8">
          {card.subject && <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{card.subject}</p>}
          <p className="break-words text-lg font-medium sm:text-xl">{card.front}</p>
          {shown ? (
            <div className="rounded-md border bg-muted/40 p-4" aria-live="polite">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Answer</p>
              <p className="whitespace-pre-wrap break-words">{card.back}</p>
            </div>
          ) : (
            <Button onClick={() => setShown(true)} className="min-h-11 w-full" autoFocus>Show the answer</Button>
          )}
        </CardContent>
      </Card>
      {shown && (
        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline" disabled={saving} onClick={() => answer(false)} className="min-h-12">
            <X className="mr-2 h-4 w-4" aria-hidden /> Not yet
          </Button>
          <Button disabled={saving} onClick={() => answer(true)} className="min-h-12">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Check className="mr-2 h-4 w-4" aria-hidden />} I knew it
          </Button>
        </div>
      )}
    </div>
  );
}

function AddCard({ open, onOpenChange, onAdded }: { open: boolean; onOpenChange: (open: boolean) => void; onAdded: () => void }) {
  const { toast } = useToast();
  const [subject, setSubject] = useState('');
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const out = await homeworkRequest<{ added: number }>('/api/students/flashcards', { method: 'POST', body: JSON.stringify({ cards: [{ subject, front, back }] }) });
      if (out.added === 0) return toast({ title: 'You already have a card with this question.', variant: 'destructive' });
      toast({ title: 'Card added' });
      setFront('');
      setBack('');
      onAdded();
      onOpenChange(false);
    } catch (error) {
      toast({ title: (error as Error).message || 'Could not save the card.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-lg">
        <form onSubmit={save} className="space-y-4">
          <DialogHeader>
            <DialogTitle>New card</DialogTitle>
            <DialogDescription>Put a question on the front and its answer on the back.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="card-subject">Subject (optional)</Label>
            <Input id="card-subject" value={subject} maxLength={FLASHCARD_SUBJECT_MAX} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="card-front">Question</Label>
            <Textarea id="card-front" required value={front} maxLength={FLASHCARD_FRONT_MAX} rows={2} onChange={(e) => setFront(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="card-back">Answer</Label>
            <Textarea id="card-back" required value={back} maxLength={FLASHCARD_BACK_MAX} rows={3} onChange={(e) => setBack(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving || !front.trim() || !back.trim()} className="min-h-11">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />} Add card
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** A student's revision cards: review what is due today, add and remove cards. */
export function Flashcards() {
  const { toast } = useToast();
  const cards = useHomeworkData<Data>('/api/students/flashcards');
  const [queue, setQueue] = useState<Flashcard[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Flashcard | null>(null);
  const [busy, setBusy] = useState(false);

  const list = cards.data?.cards ?? [];
  const today = cards.data?.today ?? '';
  const due = useMemo(() => dueCards(list, today), [list, today]);

  if (cards.loading && !cards.data) return <Loading />;
  if (cards.error || !cards.data) return <LoadError message={cards.error || 'Could not load your cards.'} retry={() => void cards.refresh()} />;

  if (queue) {
    return (
      <Review
        queue={queue}
        onDone={(remembered) => {
          setQueue(null);
          toast({ title: `Review finished: you knew ${remembered} of ${queue.length}.` });
          void cards.refresh();
        }}
      />
    );
  }

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      await homeworkRequest(`/api/students/flashcards/${removing.id}`, { method: 'DELETE' });
      setRemoving(null);
      void cards.refresh();
    } catch (error) {
      toast({ title: (error as Error).message || 'Could not remove the card.', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-lg font-semibold">
              {due.length === 0 ? (list.length ? 'Nothing to review today' : 'No cards yet') : `${due.length} ${due.length === 1 ? 'card' : 'cards'} to review today`}
            </p>
            <p className="text-sm text-muted-foreground">
              {list.length
                ? 'Cards you know come back less often. Cards you miss come back tomorrow.'
                : 'Add your own, or save the questions you miss at the end of a practice set.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {due.length > 0 && (
              <Button onClick={() => setQueue(due)} className="min-h-11">
                <RotateCcw className="mr-2 h-4 w-4" aria-hidden /> Start review
              </Button>
            )}
            <Button variant="outline" onClick={() => setAdding(true)} className="min-h-11">
              <Plus className="mr-2 h-4 w-4" aria-hidden /> New card
            </Button>
          </div>
        </CardContent>
      </Card>

      {list.length === 0 ? (
        <Notice>
          <Layers className="mx-auto mb-3 h-8 w-8" aria-hidden />
          Your revision cards will show here.
        </Notice>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {list.map((card) => (
            <li key={card.id}>
              <Card className="h-full">
                <CardContent className="flex h-full flex-col gap-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 break-words font-medium">{card.front}</p>
                    <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label={`Remove card: ${card.front}`} onClick={() => setRemoving(card)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <details className="text-sm">
                    <summary className="cursor-pointer py-1 text-muted-foreground">Answer</summary>
                    <p className="whitespace-pre-wrap break-words pt-1">{card.back}</p>
                  </details>
                  <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-muted-foreground">
                    {card.subject && <span>{card.subject}</span>}
                    <span className={cn(card.dueOn <= today && 'font-medium text-foreground')}>{dueLabel(card.dueOn, today)}</span>
                    <span aria-label={`Level ${card.box} of ${FLASHCARD_BOXES}`} className="flex gap-0.5">
                      {Array.from({ length: FLASHCARD_BOXES }, (_, i) => (
                        <span key={i} aria-hidden className={cn('h-1.5 w-4 rounded-full', i < card.box ? 'bg-primary' : 'bg-muted')} />
                      ))}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <AddCard open={adding} onOpenChange={setAdding} onAdded={() => void cards.refresh()} />
      <Dialog open={Boolean(removing)} onOpenChange={(open) => { if (!open) setRemoving(null); }}>
        <DialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove this card?</DialogTitle>
            <DialogDescription className="break-words">{removing?.front}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRemoving(null)} className="min-h-11">Keep it</Button>
            <Button variant="destructive" disabled={busy} onClick={remove} className="min-h-11">Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
