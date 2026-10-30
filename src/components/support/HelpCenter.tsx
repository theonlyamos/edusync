'use client';

import Link from 'next/link';
import { useCallback, useContext, useEffect, useId, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Inbox, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AppUserContext } from '@/components/providers/SupabaseAuthProvider';
import { useHomeworkData } from '@/components/homework/shared';
import { CategoryPill, Conversation, StatusPill, UnreadDot, formatWhen, sendJson } from '@/components/support/SupportParts';
import {
  MAX_MESSAGE,
  MAX_SUBJECT,
  SUPPORT_CATEGORIES,
  SUPPORT_READ_EVENT,
  cleanPagePath,
  helpPath,
  type SupportCategory,
  type SupportPortal,
  type SupportRequestDetail,
  type SupportRequestRow,
} from '@/lib/support';
import { cn } from '@/lib/utils';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Help & feedback: send the InsyteAI team a message and follow the replies. */
export function HelpCenter({ portal }: { portal: SupportPortal }) {
  const params = useSearchParams();
  const router = useRouter();
  const requested = params.get('request');
  const requestId = requested && UUID.test(requested) ? requested : null;
  const from = cleanPagePath(params.get('from'));
  const base = helpPath(portal);
  const sent = params.get('sent') === '1';
  const open = (id: string | null, justSent = false) => router.push(id ? `${base}?request=${id}${justSent ? '&sent=1' : ''}` : base, { scroll: true });

  return (
    <div className="mx-auto max-w-5xl">
      {requestId ? (
        <RequestView id={requestId} justSent={sent} onBack={() => open(null)} />
      ) : (
        <Overview portal={portal} from={from} onOpen={open} />
      )}
    </div>
  );
}

function Overview({ portal, from, onOpen }: { portal: SupportPortal; from: string | null; onOpen: (id: string, justSent?: boolean) => void }) {
  const list = useHomeworkData<{ requests: SupportRequestRow[] }>('/api/support');
  const { user } = useContext(AppUserContext);
  // In the school admin portal they are the school, so the "ask your school" hint doesn't apply.
  const inClassroom = portal === 'help' && (user?.role === 'student' || user?.role === 'teacher');

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-bold sm:text-3xl">Help &amp; feedback</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">
          Report a problem, suggest a feature, raise a complaint or ask for help. The InsyteAI team reads every message and replies here and by email.
        </p>
      </header>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <NewRequestForm
          portal={portal}
          from={from}
          email={user?.email ?? null}
          note={inClassroom ? (user?.role === 'student'
            ? 'Questions about your classes, homework or marks? Your teacher can usually help fastest.'
            : 'Questions about your classes or students? Your school administrator can usually help fastest.') : null}
          onSent={(id) => onOpen(id, true)}
        />
        <Card className="h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Your requests</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {list.loading && !list.data ? (
              <p role="status" className="flex items-center gap-2 px-6 pb-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…</p>
            ) : list.error ? (
              <div role="alert" className="space-y-2 px-6 pb-6 text-sm text-muted-foreground">
                <p>{list.error}</p>
                <Button variant="outline" size="sm" onClick={list.refresh}>Try again</Button>
              </div>
            ) : (list.data?.requests.length ?? 0) === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 pb-8 pt-2 text-center text-sm text-muted-foreground">
                <Inbox className="h-8 w-8" aria-hidden />
                <p>Nothing yet. Requests you send will show up here with our replies.</p>
              </div>
            ) : (
              <ul className="divide-y border-t">
                {list.data!.requests.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => onOpen(r.id)}
                      className="flex w-full flex-col gap-1 px-6 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
                    >
                      <span className="flex w-full items-center gap-2">
                        {r.unread && <UnreadDot label="New reply" />}
                        <span className={cn('min-w-0 flex-1 truncate text-sm', r.unread ? 'font-semibold' : 'font-medium')}>{r.subject}</span>
                        <StatusPill status={r.status} />
                      </span>
                      {r.preview && <span className="line-clamp-2 break-words text-xs text-muted-foreground">{r.preview}</span>}
                      <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <CategoryPill category={r.category} />
                        <time dateTime={r.lastMessageAt}>{formatWhen(r.lastMessageAt)}</time>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function NewRequestForm({ portal, from, email, note, onSent }: { portal: SupportPortal; from: string | null; email: string | null; note: string | null; onSent: (id: string) => void }) {
  const ids = useId();
  const [category, setCategory] = useState<SupportCategory | ''>('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!category) return setError('Choose what your message is about.');
    if (!subject.trim()) return setError('Add a short subject.');
    if (!message.trim()) return setError('Tell us what happened or what you need.');
    setSending(true);
    setError('');
    try {
      const result = await sendJson<{ id: string }>('/api/support', 'POST', { category, subject, message, pagePath: from, portal });
      onSent(result.id);
    } catch (e) {
      setError((e as Error).message);
      setSending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Send us a message</CardTitle>
        {note && <CardDescription>{note}</CardDescription>}
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-5" noValidate>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">What is it about?</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {SUPPORT_CATEGORIES.map((c) => (
                <label
                  key={c.value}
                  className={cn(
                    'flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-muted/50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                    category === c.value && 'border-primary bg-primary/10',
                  )}
                >
                  <input type="radio" name={`${ids}-category`} value={c.value} checked={category === c.value} onChange={() => setCategory(c.value)} className="h-4 w-4 accent-[hsl(var(--primary))]" />
                  {c.label}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="space-y-2">
            <Label htmlFor={`${ids}-subject`}>Subject</Label>
            <Input id={`${ids}-subject`} value={subject} maxLength={MAX_SUBJECT} onChange={(e) => setSubject(e.target.value)} placeholder="A few words, like “Homework won’t submit”" />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${ids}-message`}>Message</Label>
            <Textarea
              id={`${ids}-message`}
              value={message}
              maxLength={MAX_MESSAGE}
              onChange={(e) => setMessage(e.target.value)}
              className="min-h-[150px]"
              placeholder="What happened, what you expected, and anything that helps us understand."
              aria-describedby={`${ids}-hint`}
            />
            <p id={`${ids}-hint`} className="text-xs text-muted-foreground">
              We’ll attach the page you came from and your browser so we can look into it.{message.length > MAX_MESSAGE - 500 && ` ${MAX_MESSAGE - message.length} characters left.`}
            </p>
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {email && <p className="text-xs text-muted-foreground">Replies also go to {email}.</p>}
            <Button type="submit" disabled={sending} className="min-h-11 gap-2">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
              {sending ? 'Sending…' : 'Send'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function RequestView({ id, justSent, onBack }: { id: string; justSent: boolean; onBack: () => void }) {
  const loaded = useHomeworkData<{ request: SupportRequestDetail }>(`/api/support/${id}`);
  const [reply, setReply] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const request = loaded.data?.request;

  useEffect(() => {
    if (request) window.dispatchEvent(new Event(SUPPORT_READ_EVENT));
  }, [request]);

  const send = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    if (!reply.trim()) return setError('Write a message first.');
    setSending(true);
    setError('');
    try {
      const result = await sendJson<{ request: SupportRequestDetail }>(`/api/support/${id}`, 'POST', { message: reply });
      loaded.setData(result);
      setReply('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }, [id, reply, loaded]);

  return (
    <div className="mx-auto max-w-3xl">
      <Button variant="ghost" onClick={onBack} className="-ml-3 mb-4 min-h-11 gap-2 text-muted-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden /> All requests
      </Button>
      {loaded.loading && !request ? (
        <p role="status" className="flex items-center gap-2 py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Loading…</p>
      ) : loaded.error || !request ? (
        <div role="alert" className="space-y-3 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          <p>{loaded.error || 'We couldn’t find that request.'}</p>
          <Button variant="outline" onClick={onBack}>Back to Help &amp; feedback</Button>
        </div>
      ) : (
        <>
          <header className="mb-5 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={request.status} />
              <CategoryPill category={request.category} />
            </div>
            <h1 className="break-words text-2xl font-bold">{request.subject}</h1>
            <p className="text-sm text-muted-foreground">Sent {formatWhen(request.createdAt)}</p>
          </header>
          {justSent && request.messages.length === 1 && (
            <p role="status" className="mb-5 flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
              Thanks, we’ve got it. We’ll reply here and by email.
            </p>
          )}
          <Conversation messages={request.messages} viewer="person" />
          <form onSubmit={send} className="mt-6 space-y-3 rounded-xl border bg-card p-4">
            <Label htmlFor="support-reply">{request.status === 'resolved' ? 'Still need help? Add a message to reopen this request' : 'Add a message'}</Label>
            <Textarea id="support-reply" value={reply} maxLength={MAX_MESSAGE} onChange={(e) => setReply(e.target.value)} className="min-h-[100px]" />
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end">
              <Button type="submit" disabled={sending} className="min-h-11 gap-2">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
                {sending ? 'Sending…' : 'Send'}
              </Button>
            </div>
          </form>
          {request.pagePath && (
            <p className="mt-4 text-xs text-muted-foreground">
              Sent from <Link href={request.pagePath} className="underline-offset-2 hover:underline">{request.pagePath}</Link>
            </p>
          )}
        </>
      )}
    </div>
  );
}
