'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, Drama, Loader2, MessageSquare, Mic, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { CoauthorFocus, CoauthorMessage, CoauthorProposal } from '@/lib/lesson-artifacts/coauthor';
import type { LessonContext } from '@/hooks/useAudioStreaming';
import { CoauthorVoice } from './CoauthorVoice';
import { CoauthorSketch } from './CoauthorSketch';
import { SKETCH_ROLE_LABELS, type SketchResult } from '@/lib/lesson-artifacts/sketch';
import { clearRehearsalNotes, readRehearsalNotes, rehearsalNotesKey, rehearsalNotesMessage, rehearsalPrompt, REHEARSAL_PROFILES, type RehearsalNote } from '@/lib/lesson-artifacts/rehearsal-notes';

type ProposalState = 'pending' | 'applying' | 'applied' | 'dismissed';
type Entry =
  /** `shown` is a short label for long built-in prompts; `text` is what the co-author reads. */
  | { id: string; role: 'teacher'; text: string; shown?: string; voice?: boolean }
  | { id: string; role: 'coauthor'; text: string; proposals: Array<{ proposal: CoauthorProposal; state: ProposalState; sketch?: SketchResult }> };

const HISTORY_LIMIT = 30;
const PROPOSAL_LABELS: Record<CoauthorProposal['type'], string> = {
  objectives: 'Objectives',
  lesson_direction: 'Lesson direction',
  concept: 'Creative concept',
  regenerate: 'Remake material',
  quiz: 'Knowledge check',
  content: 'Lesson text',
  generate_introduction: 'Lesson introduction',
  generate_materials: 'Make materials',
  prepare_all: 'Prepare all objectives',
  sketch: 'Live sketch',
};

/** Where an applied proposal lands, and what it costs, in the teacher's words. */
function proposalNote(proposal: CoauthorProposal) {
  switch (proposal.type) {
    case 'objectives':
    case 'lesson_direction': return 'Fills in Lesson direction. You check it and save.';
    case 'concept': return 'Puts the concept in the editor. You generate materials from it.';
    case 'regenerate': return proposal.materialKey === 'introduction' || proposal.materialKey === 'lesson'
      ? "Uses 1 image from your school's AI allowance."
      : "Uses 1 visual from your school's AI allowance.";
    case 'quiz': return 'Saves a new draft version for you to approve. No credits.';
    case 'content': return 'Replaces the lesson text students read. No credits.';
    case 'generate_introduction': return "Makes a new introduction image. Uses 1 image from your school's AI allowance.";
    case 'generate_materials': return "Makes 5 materials in the background: 3 visuals, 1 image and 1 quiz from your school's AI allowance.";
    case 'prepare_all': return 'Opens the Prepare dialog, which shows the cost before anything starts.';
    case 'sketch': return '';
  }
}

function proposalDetail(proposal: CoauthorProposal) {
  switch (proposal.type) {
    case 'objectives': return <ol className="list-decimal space-y-1 pl-4">{proposal.objectives.map((item, index) => <li key={index}>{item.text}</li>)}</ol>;
    case 'lesson_direction': return <p className="whitespace-pre-wrap">{proposal.visualInstructions || '(No direction)'}</p>;
    case 'concept': return <p className="line-clamp-6 whitespace-pre-wrap">{proposal.concept}</p>;
    case 'regenerate': return <p className="whitespace-pre-wrap">&ldquo;{proposal.feedback}&rdquo;</p>;
    case 'quiz': return <ol className="list-decimal space-y-1 pl-4">{proposal.payload.questions.map(question => <li key={question.id}>{question.prompt}</li>)}</ol>;
    case 'content': return <p className="line-clamp-6 whitespace-pre-wrap">{proposal.content}</p>;
    case 'generate_materials': return proposal.concept ? <p className="line-clamp-6 whitespace-pre-wrap">{proposal.concept}</p> : <p>Uses the concept already in the Studio.</p>;
    case 'generate_introduction':
    case 'prepare_all':
    case 'sketch': return null;
  }
}

const applyLabel = (proposal: CoauthorProposal) => ({ regenerate: 'Remake it', generate_introduction: 'Generate', generate_materials: 'Generate', prepare_all: 'Review & prepare' } as Partial<Record<CoauthorProposal['type'], string>>)[proposal.type] ?? 'Apply';
const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

/** Text sent back to the model, so it knows which proposals the teacher used. */
export function entryToMessage(entry: Entry): CoauthorMessage {
  if (entry.role === 'teacher') return { role: 'teacher', text: entry.text.slice(0, 4_000) };
  const outcomes = entry.proposals.map(({ proposal, state, sketch }) => proposal.type === 'sketch'
    ? `[Sketch, ${SKETCH_ROLE_LABELS[proposal.role]}, ${state === 'applied' ? 'kept as a material' : sketch ? 'drawn' : 'not drawn yet'}: ${(sketch?.taskDescription ?? proposal.taskDescription).slice(0, 600)}]`
    : `[${state === 'applied' ? 'Applied' : state === 'dismissed' ? 'Dismissed' : 'Not used yet'}: ${proposal.summary}]`);
  return { role: 'coauthor', text: [entry.text, ...outcomes].join('\n').slice(0, 4_000) };
}

function readHistory(key: string): Entry[] {
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) || '[]');
    return Array.isArray(saved) ? saved.slice(-HISTORY_LIMIT) : [];
  } catch { return []; }
}

export function CoauthorPanel({ lessonId, lesson, focus, focusLabel, starters, blockedReason, onApply, objectiveLabel, keepSketchBlocked, onKeepSketch, queued, onQueuedHandled, onClose, className }: {
  lessonId: string;
  /** Title, subject, grade and objectives, for the voice mode's prompt. */
  lesson: LessonContext;
  focus: CoauthorFocus;
  /** What the teacher is looking at, e.g. "Knowledge check, objective 2". */
  focusLabel: string;
  starters: string[];
  /** Returns why a proposal can't be applied right now, or undefined. */
  blockedReason: (proposal: CoauthorProposal) => string | undefined;
  onApply: (proposal: CoauthorProposal) => Promise<boolean>;
  /** "Objective 2", for sketch cards. */
  objectiveLabel: (objectiveId: string) => string;
  keepSketchBlocked: (sketch: SketchResult) => string | undefined;
  onKeepSketch: (sketch: SketchResult) => Promise<boolean>;
  /** A message the Studio wants sent, such as a comment pinned on a material. */
  queued?: { id: string; text: string; shown?: string };
  onQueuedHandled: (id: string) => void;
  onClose: () => void;
  className?: string;
}) {
  const storageKey = `insyte:coauthor:${lessonId}`;
  const [entries, setEntries] = useState<Entry[]>(() => typeof window === 'undefined' ? [] : readHistory(storageKey));
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();
  const [voiceOn, setVoiceOn] = useState(false);
  const entriesRef = useRef<Entry[]>([]);
  useEffect(() => { entriesRef.current = entries; }, [entries]);
  const [notes, setNotes] = useState<RehearsalNote[]>(() => typeof window === 'undefined' ? [] : readRehearsalNotes(lessonId));
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try { sessionStorage.setItem(storageKey, JSON.stringify(entries.slice(-HISTORY_LIMIT))); }
    catch { /* Session storage is optional; the chat still works without it. */ }
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [entries, storageKey]);

  // Notes flagged in the student preview (another tab) arrive through storage events.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => { if (event.key === rehearsalNotesKey(lessonId)) setNotes(readRehearsalNotes(lessonId)); };
    const onFocus = () => setNotes(readRehearsalNotes(lessonId));
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', onFocus);
    return () => { window.removeEventListener('storage', onStorage); window.removeEventListener('focus', onFocus); };
  }, [lessonId]);

  /** One co-author turn. Resolves with its reply entry, or throws with a message for the teacher. */
  const ask = async (message: string, options: { voice?: boolean; shown?: string } = {}) => {
    const teacher: Entry = { id: newId(), role: 'teacher', text: message.slice(0, 4_000), shown: options.shown, voice: options.voice };
    const history = [...entriesRef.current, teacher].slice(-HISTORY_LIMIT);
    entriesRef.current = history;
    setEntries(history);
    setError(undefined);
    setSending(true);
    try {
      const response = await fetch(`/api/teachers/lessons/${lessonId}/coauthor`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history.map(entryToMessage), focus }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || data.message || 'The co-author could not answer.');
      const reply: Entry = {
        id: newId(), role: 'coauthor', text: String(data.reply ?? ''),
        proposals: (Array.isArray(data.proposals) ? data.proposals as CoauthorProposal[] : []).map(proposal => ({ proposal, state: 'pending' as const })),
      };
      entriesRef.current = [...entriesRef.current, reply].slice(-HISTORY_LIMIT);
      setEntries(entriesRef.current);
      return reply;
    } catch (sendError) {
      const text = sendError instanceof Error ? sendError.message : 'The co-author could not answer.';
      setError(text);
      throw new Error(text);
    } finally {
      setSending(false);
    }
  };

  /** Resolves true once the co-author has answered. */
  const send = async (text: string, shown?: string) => {
    const message = text.trim();
    if (!message || sending) return false;
    setDraft('');
    try { await ask(message, { shown }); return true; }
    // Only typed messages go back into the box; built-in prompts can simply be tapped again.
    catch { if (!shown) setDraft(current => current || message); return false; }
    finally { inputRef.current?.focus(); }
  };

  /** Voice requests: same turn, then a short summary for the voice to speak. */
  const askFromVoice = async (request: string) => {
    const reply = await ask(request, { voice: true });
    if (reply.role !== 'coauthor') return '';
    const cards = reply.proposals.map(({ proposal }) => proposal.summary);
    return `${reply.text}${cards.length ? ` Cards in the chat: ${cards.join('; ')}.` : ''}`.slice(0, 2_000);
  };

  const updateProposal = (entryId: string, index: number, change: { state?: ProposalState; sketch?: SketchResult }) => setEntries(current => current.map(entry => entry.id === entryId && entry.role === 'coauthor'
    ? { ...entry, proposals: entry.proposals.map((item, itemIndex) => itemIndex === index ? { ...item, ...change } : item) }
    : entry));
  const setProposalState = (entryId: string, index: number, state: ProposalState) => updateProposal(entryId, index, { state });

  const sendRef = useRef(send);
  useEffect(() => { sendRef.current = send; });
  const handledQueue = useRef('');
  useEffect(() => {
    // Wait for the current answer, or a pinned comment sent mid-turn would be dropped.
    if (!queued || sending || handledQueue.current === queued.id) return;
    handledQueue.current = queued.id;
    queueMicrotask(() => { void sendRef.current(queued.text, queued.shown); onQueuedHandled(queued.id); });
  }, [queued, sending, onQueuedHandled]);

  const sendNotes = async () => {
    if (!notes.length || sending) return;
    // Keep the notes if the co-author could not answer, so they can be sent again.
    if (!await send(rehearsalNotesMessage(notes), `Here are ${notes.length} note${notes.length === 1 ? '' : 's'} from my rehearsal`)) return;
    clearRehearsalNotes(lessonId);
    setNotes([]);
  };

  const apply = async (entryId: string, index: number, proposal: CoauthorProposal) => {
    setProposalState(entryId, index, 'applying');
    const ok = await onApply(proposal).catch(() => false);
    setProposalState(entryId, index, ok ? 'applied' : 'pending');
  };

  const startOver = () => {
    setEntries([]);
    setError(undefined);
    try { sessionStorage.removeItem(storageKey); } catch { /* optional */ }
  };

  return <aside aria-label="Co-author" className={cn('flex min-h-0 flex-col bg-muted/20', className)}>
    <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
      <div><p className="font-semibold">Co-author</p><p className="mt-0.5 text-xs text-muted-foreground">Sees this whole lesson. Nothing changes until you apply it.</p></div>
      <div className="flex shrink-0 items-center gap-1">
        {entries.length > 0 && <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={startOver} disabled={sending}>New chat</Button>}
        <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Close co-author" onClick={onClose}><X className="h-4 w-4" /></Button>
      </div>
    </div>
    <div className="space-y-2 border-b px-4 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-1.5"><Drama aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-muted-foreground">Rehearse as a student:</span>{REHEARSAL_PROFILES.map(profile => <button key={profile.key} type="button" disabled={sending} className="rounded-full border bg-background px-2.5 py-1 hover:bg-muted disabled:opacity-50" onClick={() => void send(rehearsalPrompt(profile), `Rehearse this lesson as a ${profile.label.toLowerCase()} student`)}>{profile.label}</button>)}<Link href={`/teachers/lessons/${lessonId}/preview?rehearse=1`} target="_blank" rel="noopener noreferrer" className="ml-auto text-primary underline-offset-2 hover:underline">Try it yourself</Link></div>
      {notes.length > 0 && <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-primary/10 px-3 py-2"><span>{notes.length} {notes.length === 1 ? 'note' : 'notes'} from your rehearsal</span><span className="flex gap-1.5"><Button type="button" size="sm" className="h-8" disabled={sending} onClick={() => void sendNotes()}>Send to co-author</Button><Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => { clearRehearsalNotes(lessonId); setNotes([]); }}>Clear</Button></span></div>}
    </div>
    <div ref={listRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
      {entries.length === 0 && <div className="space-y-3 text-sm text-muted-foreground"><MessageSquare className="h-6 w-6 text-primary/60" /><p className="leading-relaxed">Plan, rewrite or check this lesson by chatting. Try one of these, or ask in your own words.</p></div>}
      {entries.map(entry => entry.role === 'teacher'
        ? <div key={entry.id} className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm leading-relaxed text-primary-foreground">{entry.voice && <Mic aria-label="Said by voice" className="mr-1.5 inline h-3.5 w-3.5 align-[-2px] opacity-80" />}{entry.shown ?? entry.text}</div>
        : <div key={entry.id} className="space-y-3">
          <p className="max-w-[95%] whitespace-pre-wrap text-sm leading-relaxed">{entry.text}</p>
          {entry.proposals.map(({ proposal, state, sketch }, index) => {
            if (proposal.type === 'sketch') return <div key={index} className={cn('space-y-2 rounded-xl border bg-background p-3 text-sm', state !== 'applied' && 'border-primary/60 shadow-sm')}>
              <div className="flex items-center justify-between gap-2"><span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Live sketch · {SKETCH_ROLE_LABELS[proposal.role]} · {objectiveLabel(proposal.objectiveId)}</span>{state === 'applied' && <span className="flex items-center gap-1 text-xs font-medium text-primary"><Check className="h-3.5 w-3.5" />Kept</span>}</div>
              <p className="font-medium leading-snug">{proposal.summary}</p>
              <CoauthorSketch lessonId={lessonId} objectiveId={proposal.objectiveId} objectiveLabel={objectiveLabel(proposal.objectiveId)} role={proposal.role} description={proposal.taskDescription} sketch={sketch} kept={state === 'applied'} keepBlocked={sketch ? keepSketchBlocked(sketch) : undefined}
                onSketch={next => updateProposal(entry.id, index, { sketch: next, state: 'pending' })}
                onKeep={async next => { const ok = await onKeepSketch(next).catch(() => false); if (ok) setProposalState(entry.id, index, 'applied'); return ok; }} />
            </div>;
            const blocked = state === 'pending' ? blockedReason(proposal) : undefined;
            return <div key={index} className={cn('space-y-2 rounded-xl border bg-background p-3 text-sm', state === 'pending' && 'border-primary/60 shadow-sm', state === 'dismissed' && 'opacity-60')}>
              <div className="flex items-center justify-between gap-2"><span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{PROPOSAL_LABELS[proposal.type]}</span>{state === 'applied' && <span className="flex items-center gap-1 text-xs font-medium text-primary"><Check className="h-3.5 w-3.5" />Applied</span>}{state === 'dismissed' && <span className="text-xs text-muted-foreground">Dismissed</span>}</div>
              <p className="font-medium leading-snug">{proposal.summary}</p>
              {(state === 'pending' || state === 'applying') && <>
                {proposalDetail(proposal) && <div className="max-h-48 overflow-y-auto rounded-lg bg-muted/50 px-3 py-2 text-xs leading-relaxed text-muted-foreground">{proposalDetail(proposal)}</div>}
                <p className="text-xs text-muted-foreground">{blocked ?? proposalNote(proposal)}</p>
                <div className="flex gap-2"><Button size="sm" className="flex-1" disabled={!!blocked || state === 'applying'} onClick={() => void apply(entry.id, index, proposal)}>{state === 'applying' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{applyLabel(proposal)}</Button><Button size="sm" variant="outline" disabled={state === 'applying'} onClick={() => setProposalState(entry.id, index, 'dismissed')}>Dismiss</Button></div>
              </>}
            </div>;
          })}
        </div>)}
      {sending && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Thinking…</p>}
      {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    </div>
    <form className="space-y-2 border-t p-3" onSubmit={event => { event.preventDefault(); void send(draft); }}>
      {voiceOn && <CoauthorVoice lesson={lesson} onRequest={askFromVoice} onStop={() => setVoiceOn(false)} />}
      {entries.length === 0 && <div className="flex flex-wrap gap-1.5">{starters.map(starter => <button key={starter} type="button" disabled={sending} className="rounded-full border bg-background px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50" onClick={() => void send(starter)}>{starter}</button>)}</div>}
      <label htmlFor="coauthor-input" className="block text-xs text-muted-foreground">Ask or tell the co-author · about {focusLabel}</label>
      <div className="flex items-end gap-2">
        <Textarea ref={inputRef} id="coauthor-input" rows={2} maxLength={4000} value={draft} disabled={sending} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(draft); } }} placeholder="e.g. Add a question about oxygen" className="min-h-0 flex-1 resize-none bg-background" />
        {!voiceOn && <Button type="button" size="icon" variant="outline" className="h-11 w-11 shrink-0" aria-label="Talk to the co-author" title="Voice mode · 1 credit a minute" onClick={() => setVoiceOn(true)}><Mic className="h-4 w-4" /></Button>}
        <Button type="submit" size="icon" className="h-11 w-11 shrink-0" aria-label="Send" disabled={sending || !draft.trim()}><Send className="h-4 w-4" /></Button>
      </div>
    </form>
  </aside>;
}
