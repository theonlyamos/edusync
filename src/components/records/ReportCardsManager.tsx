'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Eye, Loader2, RefreshCw, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { homeworkRequest, useHomeworkData } from '@/components/homework/shared';
import { NATIVE_SELECT_CLASS } from '@/components/school-portal/PersonFormDialog';
import { REPORT_COMMENT_MAX, REPORT_TERM_MAX, attendanceRate, dayLabel, shiftDay, type ReportCard } from '@/lib/school-records';
import { ClassSelect, LoadError, Loading, WithClasses, type RecordsClasses } from './shared';

type Term = { term: string; periodStart: string; periodEnd: string };
type Loaded = { terms: Term[]; term: string | null; cards: ReportCard[] };

function CardRow({ card, basePath, onChange }: { card: ReportCard; basePath: string; onChange: (card: ReportCard) => void }) {
  const { toast } = useToast();
  const [comment, setComment] = useState(card.comment);
  const [busy, setBusy] = useState<'comment' | 'publish' | null>(null);
  useEffect(() => setComment(card.comment), [card.comment]);
  const rate = attendanceRate(card.snapshot.attendance);

  const patch = async (change: { comment?: string; published?: boolean }, which: 'comment' | 'publish') => {
    setBusy(which);
    try {
      const result = await homeworkRequest<{ card: ReportCard }>(`/api/records/report-cards/${card.id}`, { method: 'PATCH', body: JSON.stringify(change) });
      onChange(result.card);
      if (which === 'publish') toast({ title: change.published ? `Shared with ${card.snapshot.studentName}` : 'No longer shared' });
    } catch (error) {
      toast({ title: (error as Error).message || 'Could not save.', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <li className="space-y-3 px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words font-medium">{card.snapshot.studentName}</p>
          <p className="text-sm text-muted-foreground">
            {card.snapshot.overall === null ? 'No marks' : `${card.snapshot.overall}% overall`} · {rate === null ? 'no register' : `${rate}% attendance`} · {card.publishedAt ? 'Shared' : 'Draft'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild className="min-h-11"><Link href={`${basePath}/report-cards/${card.id}`}><Eye className="mr-2 h-4 w-4" /> View</Link></Button>
          <Button
            variant={card.publishedAt ? 'outline' : 'default'}
            className="min-h-11"
            disabled={busy !== null}
            onClick={() => void patch({ comment, published: !card.publishedAt }, 'publish')}
          >
            {busy === 'publish' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {card.publishedAt ? 'Stop sharing' : 'Share with student'}
          </Button>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`comment-${card.id}`} className="sr-only">Comment for {card.snapshot.studentName}</Label>
        <Textarea
          id={`comment-${card.id}`}
          value={comment}
          rows={2}
          maxLength={REPORT_COMMENT_MAX}
          placeholder="Teacher’s comment"
          onChange={(e) => setComment(e.target.value)}
          onBlur={() => { if (comment.trim() !== card.comment) void patch({ comment }, 'comment'); }}
        />
        <p className="text-xs text-muted-foreground" aria-live="polite">{busy === 'comment' ? 'Saving…' : comment.trim() !== card.comment ? 'Saves when you click away' : card.comment ? 'Saved' : ''}</p>
      </div>
    </li>
  );
}

function ClassCards({ classId, today, basePath }: { classId: string; today: string; basePath: string }) {
  const { toast } = useToast();
  const [term, setTerm] = useState<string | null>(null);
  const loaded = useHomeworkData<Loaded>(`/api/records/report-cards?classId=${classId}${term ? `&term=${encodeURIComponent(term)}` : ''}`);
  const [cards, setCards] = useState<ReportCard[]>([]);
  const [form, setForm] = useState({ term: '', periodStart: shiftDay(today, -90), periodEnd: today });
  const [busy, setBusy] = useState<'make' | 'publish' | null>(null);
  useEffect(() => { if (loaded.data) setCards(loaded.data.cards); }, [loaded.data]);

  if (loaded.loading && !loaded.data) return <Loading />;
  if (loaded.error || !loaded.data) return <LoadError message={loaded.error || 'Could not load report cards.'} retry={() => void loaded.refresh()} />;
  const { terms } = loaded.data;
  const current = loaded.data.term;
  const period = terms.find((t) => t.term === current);
  const drafts = cards.filter((card) => !card.publishedAt).length;

  const make = async (input: Term) => {
    setBusy('make');
    try {
      const result = await homeworkRequest<{ term: string; cards: ReportCard[] }>('/api/records/report-cards', { method: 'POST', body: JSON.stringify({ classId, ...input }) });
      toast({ title: `${result.cards.length} report cards ready for ${result.term}` });
      setForm((f) => ({ ...f, term: '' }));
      if (term === result.term) void loaded.refresh(); else setTerm(result.term);
    } catch (error) {
      toast({ title: (error as Error).message || 'Could not make the report cards.', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };
  const publishAll = async () => {
    if (!current) return;
    setBusy('publish');
    try {
      const result = await homeworkRequest<{ published: number; cards: ReportCard[] }>('/api/records/report-cards', { method: 'POST', body: JSON.stringify({ classId, term: current, publish: true }) });
      setCards(result.cards);
      toast({ title: `Shared ${result.published} report ${result.published === 1 ? 'card' : 'cards'}` });
    } catch (error) {
      toast({ title: (error as Error).message || 'Could not share the report cards.', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };
  const submit = (event: FormEvent) => { event.preventDefault(); void make(form); };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <section aria-label="Report cards" className="min-w-0 space-y-4">
        {terms.length === 0 ? (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No report cards for this class yet. Name a term and pick its dates to make them.</CardContent></Card>
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="report-term">Term</Label>
                <select id="report-term" className={NATIVE_SELECT_CLASS} value={current ?? ''} onChange={(e) => setTerm(e.target.value)}>
                  {terms.map((t) => <option key={t.term} value={t.term}>{t.term}</option>)}
                </select>
              </div>
              <div className="flex flex-wrap gap-2">
                {period && (
                  <Button variant="outline" className="min-h-11" disabled={busy !== null} onClick={() => void make(period)} title="Work out marks and attendance again. Comments are kept.">
                    {busy === 'make' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />} Refresh marks
                  </Button>
                )}
                {drafts > 0 && (
                  <Button className="min-h-11" disabled={busy !== null} onClick={() => void publishAll()}>
                    {busy === 'publish' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />} Share all {drafts} drafts
                  </Button>
                )}
              </div>
            </div>
            {period && <p className="text-sm text-muted-foreground">{dayLabel(period.periodStart)} to {dayLabel(period.periodEnd)}. Students only see a report card after you share it.</p>}
            <Card>
              <CardContent className="p-0">
                <ul className="divide-y">
                  {cards.map((card) => (
                    <CardRow key={card.id} card={card} basePath={basePath} onChange={(next) => setCards((list) => list.map((c) => (c.id === next.id ? next : c)))} />
                  ))}
                </ul>
              </CardContent>
            </Card>
          </>
        )}
      </section>
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-lg">New term</CardTitle>
          <CardDescription>Makes a draft report card for every student in the class from their marks and attendance between these dates.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-term">Term name</Label>
              <Input id="new-term" value={form.term} maxLength={REPORT_TERM_MAX} required placeholder="e.g. Term 1 2026/27" onChange={(e) => setForm({ ...form, term: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="term-start">First day</Label>
                <Input id="term-start" type="date" required value={form.periodStart} max={form.periodEnd} onChange={(e) => setForm({ ...form, periodStart: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="term-end">Last day</Label>
                <Input id="term-end" type="date" required value={form.periodEnd} min={form.periodStart} onChange={(e) => setForm({ ...form, periodEnd: e.target.value })} />
              </div>
            </div>
            <Button type="submit" disabled={busy !== null || !form.term.trim()} className="min-h-11">
              {busy === 'make' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Make report cards
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function Picker({ data, basePath }: { data: RecordsClasses; basePath: string }) {
  const [classId, setClassId] = useState(data.classes[0].id);
  return (
    <div className="space-y-6">
      <div className="max-w-xs"><ClassSelect classes={data.classes} value={classId} onChange={setClassId} /></div>
      <ClassCards key={classId} classId={classId} today={data.today} basePath={basePath} />
    </div>
  );
}

/** Make, comment on and share a class's report cards. `basePath` is the portal the links stay in. */
export function ReportCardsManager({ basePath }: { basePath: '/teachers' | '/school' }) {
  return <WithClasses>{(data) => <Picker data={data} basePath={basePath} />}</WithClasses>;
}
