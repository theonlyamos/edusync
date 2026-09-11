'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { ArrowRight, Check, FileUp, Loader2, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { StudioArtifact } from '@/lib/lesson-artifacts/studio-state';

const ReactRenderer = dynamic(() => import('./ReactRenderer').then(module => module.ReactRenderer), { ssr: false });
const SafeCodeRunner = dynamic(() => import('./SafeCodeRunner').then(module => module.SafeCodeRunner), { ssr: false });

function AssetPreview({ artifact }: { artifact: StudioArtifact }) {
  const [url, setUrl] = useState<string>();
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const payload = artifact.payload;
  const assetId = 'assetId' in payload ? payload.assetId : '';
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/lesson-assets/${assetId}`, { signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Could not load this resource');
        if (!controller.signal.aborted) setUrl(result.url);
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Could not load this resource');
      }
    }
    void load();
    return () => controller.abort();
  }, [assetId, attempt]);
  if (error) return <div role="alert" className="p-10 text-center"><p className="mb-4 text-sm text-destructive">{error}</p><Button variant="outline" onClick={() => { setError(undefined); setUrl(undefined); setAttempt(value => value + 1); }}>Try again</Button></div>;
  if (!url) return <div role="status" className="flex min-h-72 items-center justify-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Loading visual…</div>;
  if (payload.kind === 'uploaded_media' && !payload.mimeType.startsWith('image/')) return <a href={url} target="_blank" rel="noreferrer" className="flex min-h-64 flex-col items-center justify-center gap-3 text-sm underline"><FileUp className="h-8 w-8" />Open {payload.originalFilename}</a>;
  return <figure>
    {/* Signed private URLs bypass Next image optimization. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={url} alt={payload.kind === 'generated_image' ? payload.altText : payload.kind === 'uploaded_media' ? payload.title : 'Lesson visual'} className="max-h-[680px] w-full object-contain" onError={() => setError('The image could not be displayed')} />
  </figure>;
}

function Preview({ artifact, onValidation }: { artifact: StudioArtifact; onValidation: (status: 'passed' | 'failed', error?: string) => void }) {
  const payload = artifact.payload;
  if (payload.kind === 'interactive_visualization' || payload.kind === 'visual_quiz') return <div className="h-[520px] max-h-[75vh] min-h-[360px] overflow-hidden rounded-xl border bg-white">
    {payload.library === 'react' ? <ReactRenderer code={payload.code} onReady={() => onValidation('passed')} onError={error => onValidation('failed', error)} /> : <SafeCodeRunner code={payload.code} library={payload.library} onReady={() => onValidation('passed')} onError={error => onValidation('failed', error)} />}
  </div>;
  if (payload.kind !== 'structured_quiz') return <AssetPreview key={artifact.id} artifact={artifact} />;
  return <div className="mx-auto max-w-3xl space-y-6"><h4 className="text-lg font-semibold">{payload.title}</h4>{payload.questions.map((question, index) => <section key={question.id} className="border-b pb-6 last:border-0">
    <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Question {index + 1} · {question.points} {question.points === 1 ? 'point' : 'points'}</p>
    <p className="font-medium">{question.prompt}</p>
    {'options' in question && <ul className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">{question.options.map(option => <li key={option} className="rounded-lg border p-3">{option}</li>)}</ul>}
    <details className="mt-3 text-sm"><summary className="cursor-pointer font-medium text-primary">Answer & explanation</summary><p className="mt-2 font-medium">{Array.isArray(question.correctAnswer) ? question.correctAnswer.join(', ') : String(question.correctAnswer)}</p><p className="mt-1 leading-relaxed text-muted-foreground">{question.explanation}</p></details>
  </section>)}</div>;
}

export function StudioArtifactReview({ artifact, versions, revision, disabled, generating, feedback, historicalId, onHistory, onFeedback, onReview, onRegenerate, onValidation, onContinue }: {
  artifact: StudioArtifact;
  versions: StudioArtifact[];
  revision: number;
  disabled: boolean;
  generating: boolean;
  feedback: string;
  historicalId: string;
  onHistory: (id: string) => void;
  onFeedback: (text: string) => void;
  onReview: (id: string, decision: 'approve' | 'reject') => Promise<boolean>;
  onRegenerate: (id: string) => void;
  onValidation: (id: string, status: 'passed' | 'failed', error?: string) => void;
  onContinue: () => void;
}) {
  const [revising, setRevising] = useState(false);
  const displayed = versions.find(item => item.id === historicalId) ?? artifact;
  const historical = displayed.id !== artifact.id;
  const outdated = displayed.objective_revision !== revision;
  const interactive = ['interactive_visualization', 'visual_quiz'].includes(artifact.kind);
  const ready = artifact.validation_report?.status === 'passed' && (!interactive || artifact.validation_report.validator === 'sandbox-runtime');
  return <div className="overflow-hidden rounded-2xl border bg-card" data-testid="focused-material">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-2"><Badge variant={displayed.status === 'approved' ? 'success' : 'secondary'}>{displayed.status}</Badge><span className="text-muted-foreground">Version {displayed.version}</span>{outdated && <span className="text-amber-700 dark:text-amber-300">Earlier directions</span>}</div>
      {versions.length > 1 && <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">Version history</summary><label className="mt-2 block">Preview version<select disabled={disabled} aria-label="Preview version" className="ml-2 rounded-md border bg-background p-2 text-foreground" value={displayed.id} onChange={event => onHistory(event.target.value)}>{[...versions].sort((a, b) => b.version - a.version).map(item => <option key={item.id} value={item.id}>Version {item.version} · {item.status}{item.id === artifact.id ? ' · latest' : ''}</option>)}</select></label></details>}
    </div>
    {historical && <p className="border-b bg-muted/50 px-5 py-3 text-sm text-muted-foreground">Viewing an earlier version. Select the latest version to request changes or approve.</p>}
    <div className="p-3 sm:p-6"><Preview key={displayed.id} artifact={displayed} onValidation={(status, error) => { if (!historical) onValidation(displayed.id, status, error); }} /></div>
    {!historical && <>
      {interactive && artifact.status === 'draft' && <p role="status" className="px-5 pb-3 text-sm text-muted-foreground">{ready ? 'Preview checked. Try the controls before approving.' : artifact.validation_report?.status === 'failed' ? 'This preview has an error. Request a corrected version before approving.' : 'Checking this preview…'}</p>}
      {outdated && <p className="px-5 pb-3 text-sm text-amber-700 dark:text-amber-300">Directions have changed. Generate a new version before approving this material.</p>}
      {revising && <div className="space-y-3 border-t bg-muted/30 p-5"><label className="text-sm font-medium" htmlFor={`feedback-${artifact.id}`}>What should change?</label><Textarea id={`feedback-${artifact.id}`} value={feedback} maxLength={4000} onChange={event => onFeedback(event.target.value)} placeholder="Try a different setting, make the labels clearer, or change how students interact…" className="min-h-28" /><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground">Approved versions stay available while you review the replacement.</p><Button variant="outline" onClick={() => onRegenerate(artifact.id)} disabled={disabled || generating}><RefreshCw className="mr-2 h-4 w-4" />Generate revision</Button></div></div>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t p-4 sm:px-5">
        <div className="flex gap-2">{artifact.kind !== 'uploaded_media' && <Button variant="outline" disabled={disabled} onClick={() => setRevising(value => !value)}>{revising ? 'Close feedback' : 'Request changes'}</Button>}{artifact.status === 'draft' && <Button variant="ghost" disabled={disabled} onClick={() => void onReview(artifact.id, 'reject')}>Reject</Button>}</div>
        {artifact.status === 'draft' ? <Button disabled={disabled || outdated || !ready} onClick={async () => { if (await onReview(artifact.id, 'approve')) onContinue(); }}><Check className="mr-2 h-4 w-4" />Approve & continue</Button> : <Button onClick={onContinue} disabled={disabled}>Continue<ArrowRight className="ml-2 h-4 w-4" /></Button>}
      </div>
    </>}
  </div>;
}
