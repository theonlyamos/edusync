'use client';

import { useState } from 'react';
import { Check, Copy, Loader2, Webhook } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { homeworkRequest } from '@/components/homework/shared';
import { deliveryNote, parseWebhookUrl, type WebhookSummary } from '@/lib/webhooks';

type Saved = { webhook: WebhookSummary | null; secret?: string | null };
type Busy = 'load' | 'save' | 'rotate' | 'remove' | 'test' | null;

/** "Webhook" for one API key: where session events are sent, the signing secret, and a test button. */
export function KeyWebhook({ keyId }: { keyId: string }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [webhook, setWebhook] = useState<WebhookSummary | null>(null);
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [problem, setProblem] = useState('');
  const [notice, setNotice] = useState('');
  const base = `/api/embed/keys/${keyId}/webhook`;

  const run = async (kind: Exclude<Busy, null>, work: () => Promise<void>) => {
    setBusy(kind);
    setProblem('');
    setNotice('');
    try {
      await work();
    } catch (error) {
      setProblem((error as Error).message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(null);
    }
  };
  const apply = (saved: Saved) => {
    setWebhook(saved.webhook);
    setUrl(saved.webhook?.url ?? '');
    if (saved.secret) setSecret(saved.secret);
  };
  const load = () => run('load', async () => {
    apply(await homeworkRequest<Saved>(base));
    setLoaded(true);
  });
  const toggle = () => {
    if (!open && !loaded) void load();
    setOpen(!open);
  };
  const save = (rotate: boolean) => {
    const parsed = parseWebhookUrl(url);
    if (!parsed.ok) return setProblem(parsed.error);
    if (rotate && !window.confirm('Make a new signing secret? Your server must switch to it, or it will reject events signed with the new one.')) return;
    void run(rotate ? 'rotate' : 'save', async () => {
      apply(await homeworkRequest<Saved>(base, { method: 'PUT', body: JSON.stringify({ url: parsed.url, rotate }) }));
      setNotice(rotate ? 'New signing secret made.' : 'Webhook saved.');
    });
  };
  const remove = () => {
    if (!window.confirm('Remove this webhook? Your server will stop receiving session events for this key.')) return;
    void run('remove', async () => {
      apply(await homeworkRequest<Saved>(base, { method: 'DELETE' }));
      setSecret(null);
      setNotice('Webhook removed.');
    });
  };
  const test = () => run('test', async () => {
    const result = await homeworkRequest<{ delivered: boolean; status: number | null; note: string }>(`${base}/test`, { method: 'POST' });
    setWebhook((current) => current && { ...current, lastDeliveryAt: new Date().toISOString(), lastStatus: result.status, lastError: result.delivered ? null : result.note });
    if (result.delivered) setNotice(`Test event delivered. ${result.note}.`);
    else setProblem(`Test event not delivered: ${result.note}.`);
  });
  const copy = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setProblem('Could not copy. Select the secret and copy it by hand.');
    }
  };
  const unchanged = webhook !== null && url.trim() === webhook.url;
  const inputId = `webhook-url-${keyId}`;

  return (
    <div className="rounded-md border">
      <Button variant="ghost" onClick={toggle} aria-expanded={open} className="h-11 w-full justify-start gap-2 px-3 text-sm">
        <Webhook className="h-4 w-4" aria-hidden /> Webhook
        {loaded && webhook && <span className="text-xs font-normal text-muted-foreground">On</span>}
      </Button>
      {open && (
        <div className="space-y-3 border-t p-3">
          {busy === 'load' && <Loader2 className="h-5 w-5 animate-spin" aria-label="Loading" />}
          {!loaded && busy !== 'load' && problem && (
            <p role="alert" className="text-sm text-muted-foreground">
              {problem} <button type="button" className="underline" onClick={() => void load()}>Try again</button>
            </p>
          )}
          {loaded && (
            <>
              <p className="text-sm text-muted-foreground">
                We send a message to your server when a tutor session with this key starts and when it ends.
              </p>
              <form className="space-y-1.5" onSubmit={(event) => { event.preventDefault(); save(false); }}>
                <Label htmlFor={inputId}>Address to send events to</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input id={inputId} type="url" inputMode="url" autoComplete="off" placeholder="https://example.com/insyte-events" value={url} maxLength={500} onChange={(event) => setUrl(event.target.value)} />
                  <Button type="submit" disabled={busy !== null || !url.trim() || unchanged} className="min-h-10 shrink-0">
                    {busy === 'save' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {webhook ? 'Save address' : 'Add webhook'}
                  </Button>
                </div>
              </form>
              {secret && (
                <div className="space-y-1.5 rounded-md border border-amber-500/50 bg-amber-500/10 p-3">
                  <p className="text-sm font-medium">Signing secret</p>
                  <p className="text-xs text-muted-foreground">Copy it now and keep it on your server. It is not shown again.</p>
                  <div className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 break-all rounded bg-background px-2 py-1 text-xs">{secret}</code>
                    <Button type="button" variant="outline" size="sm" onClick={() => void copy()} aria-label="Copy signing secret">
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              )}
              {webhook && (
                <>
                  <p className="text-xs text-muted-foreground">
                    {webhook.lastDeliveryAt
                      ? <>Last event {new Date(webhook.lastDeliveryAt).toLocaleString()}: {deliveryNote(webhook.lastStatus, webhook.lastError)}.</>
                      : 'No events sent yet.'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => void test()}>
                      {busy === 'test' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Send test event
                    </Button>
                    <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => save(true)}>
                      {busy === 'rotate' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} New signing secret
                    </Button>
                    <Button type="button" variant="ghost" size="sm" disabled={busy !== null} onClick={remove} className="text-destructive hover:text-destructive">
                      Remove
                    </Button>
                  </div>
                </>
              )}
              {problem && <p role="alert" className="text-sm text-destructive">{problem}</p>}
              {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
