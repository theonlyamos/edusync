'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  CircleDashed,
  Eye,
  FileUp,
  ImageIcon,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
  X,
  Zap,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import {
  isArtifactActionBusy,
  shouldApplyRemoteObjectives,
  summarizeContentJobs,
  type ArtifactBusyState,
  type ContentJobSummary,
} from '@/lib/lesson-artifacts/authoring-ui';

const ReactRenderer = dynamic(
  () => import('@/components/lessons/ReactRenderer').then((module) => module.ReactRenderer),
  { ssr: false, loading: () => <div className="h-[320px] animate-pulse rounded-xl bg-muted" /> },
);

const SafeCodeRunner = dynamic(
  () => import('@/components/lessons/SafeCodeRunner').then((module) => module.SafeCodeRunner),
  { ssr: false, loading: () => <div className="h-[320px] animate-pulse rounded-xl bg-muted" /> },
);

type Objective = { id: string; text: string; position: number; revision: number };
type Artifact = {
  id: string;
  objective_id: string;
  objective_revision: number;
  series_id: string;
  version: number;
  kind: 'interactive_visualization' | 'generated_image' | 'structured_quiz' | 'visual_quiz' | 'uploaded_media';
  status: 'draft' | 'approved' | 'rejected' | 'failed';
  position: number;
  payload: any;
  validation_report?: { status?: string; validator?: string; error?: string } | null;
};
type AuthoringData = {
  lesson: { id: string; title: string; subject: string; gradeLevel: string; content: string | null };
  objectives: Objective[];
  artifacts: Artifact[];
  currentPublication: { id: string; version: number; warnings: string[]; published_at: string } | null;
};

const artifactLabels: Record<Artifact['kind'], string> = {
  interactive_visualization: 'Interactive',
  generated_image: 'Illustration',
  structured_quiz: 'Knowledge check',
  visual_quiz: 'Visual challenge',
  uploaded_media: 'Teacher media',
};

async function readJson(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

function AssetImage({ assetId, alt, mimeType, filename }: { assetId: string; alt: string; mimeType?: string; filename?: string }) {
  const [url, setUrl] = useState<string>();
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    fetch(`/api/lesson-assets/${assetId}`)
      .then(readJson)
      .then((data) => active && setUrl(data.url))
      .catch((assetError) => active && setError(assetError instanceof Error ? assetError.message : 'Could not load this resource'));
    return () => { active = false; };
  }, [assetId, attempt]);
  if (error) {
    return (
      <div className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
        <p className="text-sm text-destructive">{error}</p>
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => { setUrl(undefined); setError(undefined); setAttempt((value) => value + 1); }}>Try again</Button>
      </div>
    );
  }
  if (url && mimeType && !mimeType.startsWith('image/')) {
    return <a href={url} target="_blank" rel="noreferrer" className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-border bg-background p-6 text-center hover:bg-muted"><FileUp className="mb-3 h-8 w-8 text-muted-foreground" /><span className="text-sm font-medium text-foreground">{filename || alt}</span><span className="mt-1 text-xs text-muted-foreground">Open teacher resource</span></a>;
  }
  return url ? (
    // Signed, private Supabase URL is intentionally not passed through Next image optimization.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={alt} className="aspect-[4/3] w-full rounded-xl object-cover" />
  ) : <div className="flex aspect-[4/3] items-center justify-center rounded-xl bg-muted"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
}

function ArtifactPreview({
  artifact,
  onValidation,
}: {
  artifact: Artifact;
  onValidation: (status: 'passed' | 'failed', error?: string) => void;
}) {
  if (artifact.kind === 'interactive_visualization' || artifact.kind === 'visual_quiz') {
    return (
      <div className="h-[340px] overflow-hidden rounded-xl border border-border bg-background">
        {artifact.payload.library === 'react' ? (
          <ReactRenderer code={artifact.payload.code} onReady={() => onValidation('passed')} onError={(error) => onValidation('failed', error)} />
        ) : (
          <SafeCodeRunner code={artifact.payload.code} library={artifact.payload.library} onReady={() => onValidation('passed')} onError={(error) => onValidation('failed', error)} />
        )}
      </div>
    );
  }
  if (artifact.kind === 'generated_image' || artifact.kind === 'uploaded_media') {
    return <AssetImage assetId={artifact.payload.assetId} alt={artifact.payload.altText || artifact.payload.title || 'Lesson visual'} mimeType={artifact.payload.mimeType} filename={artifact.payload.originalFilename} />;
  }
  return (
    <div className="space-y-3">
      <p className="font-semibold text-foreground">{artifact.payload.title}</p>
      {artifact.payload.questions?.map((question: any, index: number) => (
        <div key={question.id} className="rounded-xl border border-border bg-background p-4">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span>{question.type?.replaceAll('_', ' ')}</span><span>·</span><span>{question.points} point{question.points === 1 ? '' : 's'}</span>
          </div>
          <p className="text-sm font-medium text-foreground"><span className="mr-2 text-muted-foreground">{index + 1}.</span>{question.prompt}</p>
          {question.options?.length ? <ul className="mt-3 grid gap-1.5 text-xs text-muted-foreground sm:grid-cols-2">{question.options.map((option: string) => <li key={option} className="rounded-md border border-border px-2.5 py-2">{option}</li>)}</ul> : null}
          <p className="mt-3 text-xs font-medium text-emerald-700 dark:text-emerald-400">Answer: {Array.isArray(question.correctAnswer) ? question.correctAnswer.join(', ') : String(question.correctAnswer)}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{question.explanation}</p>
        </div>
      ))}
    </div>
  );
}

export function ObjectiveAuthoringWorkspace({ lessonId }: { lessonId: string }) {
  const { toast } = useToast();
  const [data, setData] = useState<AuthoringData>();
  const [loadError, setLoadError] = useState<string>();
  const [draftObjectives, setDraftObjectives] = useState<Array<Objective | { id?: string; text: string; position: number; revision?: number }>>([]);
  const [objectivesDirty, setObjectivesDirty] = useState(false);
  const [activeObjectiveId, setActiveObjectiveId] = useState<string>();
  const [busy, setBusy] = useState<string>();
  const [artifactBusy, setArtifactBusy] = useState<ArtifactBusyState>();
  const [batchId, setBatchId] = useState<string>();
  const [jobProgress, setJobProgress] = useState<ContentJobSummary>();
  const uploadRef = useRef<HTMLInputElement>(null);
  const objectivesDirtyRef = useRef(false);
  const validationStateRef = useRef(new Map<string, string>());

  const setDirty = useCallback((dirty: boolean) => {
    objectivesDirtyRef.current = dirty;
    setObjectivesDirty(dirty);
  }, []);

  const updateDraftObjectives = useCallback((update: (items: typeof draftObjectives) => typeof draftObjectives) => {
    setDraftObjectives((items) => update(items));
    setDirty(true);
  }, [setDirty]);

  const load = useCallback(async ({ forceDraftSync = false }: { forceDraftSync?: boolean } = {}) => {
    try {
      const next = await readJson(await fetch(`/api/teachers/lessons/${lessonId}/authoring`, { cache: 'no-store' }));
      setData(next);
      setLoadError(undefined);
      if (shouldApplyRemoteObjectives({ dirty: objectivesDirtyRef.current, force: forceDraftSync })) {
        setDraftObjectives(next.objectives);
        setDirty(false);
      }
      setActiveObjectiveId((current) => current && next.objectives.some((item: Objective) => item.id === current) ? current : next.objectives[0]?.id);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load Objective Studio');
      throw error;
    }
  }, [lessonId, setDirty]);

  useEffect(() => {
    queueMicrotask(() => load({ forceDraftSync: true }).catch((error) => toast({ title: 'Could not load Objective Studio', description: error.message, variant: 'destructive' })));
  }, [load, toast]);

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!objectivesDirtyRef.current) return;
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, []);

  useEffect(() => {
    if (!batchId) return;
    let failures = 0;
    let emptyPolls = 0;
    let stopped = false;
    const poll = async () => {
      if (stopped) return;
      try {
        const result = await readJson(await fetch(`/api/content-jobs?batchId=${batchId}`, { cache: 'no-store' }));
        failures = 0;
        const summary = summarizeContentJobs(result.jobs);
        setJobProgress(summary);
        emptyPolls = summary.total === 0 ? emptyPolls + 1 : 0;
        if (emptyPolls >= 3) {
          stopped = true;
          setBatchId(undefined);
          setBusy(undefined);
          setArtifactBusy(undefined);
          toast({ title: 'Generation jobs were not found', description: 'Start generation again to retry.', variant: 'destructive' });
          return;
        }
        if (summary.total && summary.done === summary.total) {
          stopped = true;
          setBatchId(undefined);
          setBusy(undefined);
          setArtifactBusy(undefined);
          await load();
          if (summary.failed || summary.cancelled) {
            toast({
              title: 'Bundle completed with issues',
              description: `${summary.succeeded} succeeded, ${summary.failed} failed, and ${summary.cancelled} cancelled. You can generate again to retry.`,
              variant: 'destructive',
            });
          } else {
            toast({ title: 'Bundle ready for review', description: 'Preview each item before approving it.' });
          }
        }
      } catch (error) {
        failures += 1;
        if (failures >= 3) {
          stopped = true;
          setBatchId(undefined);
          setBusy(undefined);
          setArtifactBusy(undefined);
          toast({ title: 'Generation status unavailable', description: error instanceof Error ? error.message : 'Try generating again.', variant: 'destructive' });
        }
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 2_000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [batchId, load, toast]);

  const latestArtifacts = useMemo(() => {
    const latest = new Map<string, Artifact>();
    for (const artifact of data?.artifacts ?? []) {
      const current = latest.get(artifact.series_id);
      if (!current || artifact.version > current.version) latest.set(artifact.series_id, artifact);
    }
    return [...latest.values()];
  }, [data?.artifacts]);
  const latestApprovedArtifacts = useMemo(() => {
    const latest = new Map<string, Artifact>();
    for (const artifact of data?.artifacts ?? []) {
      if (artifact.status !== 'approved') continue;
      const current = latest.get(artifact.series_id);
      if (!current || artifact.version > current.version) latest.set(artifact.series_id, artifact);
    }
    return [...latest.values()];
  }, [data?.artifacts]);
  const activeObjective = data?.objectives.find((objective) => objective.id === activeObjectiveId);
  const activeArtifacts = latestArtifacts
    .filter((artifact) => artifact.objective_id === activeObjectiveId)
    .sort((left, right) => left.position - right.position);
  const approvedArtifacts = latestApprovedArtifacts.filter((artifact) => artifact.objective_id === activeObjectiveId && artifact.objective_revision === activeObjective?.revision);
  const approved = approvedArtifacts.length;
  const recommended = 5;

  const saveObjectives = async () => {
    if (!data) return;
    setBusy('save');
    try {
      await readJson(await fetch(`/api/teachers/lessons/${lessonId}/authoring`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data.lesson, objectives: draftObjectives.map(({ id, text }) => ({ id, text })) }),
      }));
      await load({ forceDraftSync: true });
      toast({ title: 'Objectives saved', description: 'Changed objectives now have a new revision.' });
    } catch (error) {
      toast({ title: 'Could not save objectives', description: (error as Error).message, variant: 'destructive' });
    } finally { setBusy(undefined); }
  };

  const generateBundle = async () => {
    if (!activeObjectiveId) return;
    setBusy('generate');
    try {
      const result = await readJson(await fetch(`/api/teachers/objectives/${activeObjectiveId}/generate-bundle`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      }));
      setBatchId(result.batchId);
      setJobProgress({ total: result.jobs.length, done: 0, succeeded: 0, failed: 0, cancelled: 0, active: result.jobs.length });
    } catch (error) {
      setBusy(undefined);
      toast({ title: 'Could not start generation', description: (error as Error).message, variant: 'destructive' });
    }
  };

  const uploadMedia = async (file?: File) => {
    if (!file || !activeObjectiveId) return;
    setBusy('upload');
    try {
      const body = new FormData();
      body.set('file', file);
      const result = await readJson(await fetch(`/api/teachers/objectives/${activeObjectiveId}/assets`, { method: 'POST', body }));
      setBatchId(result.batchId);
      setJobProgress({ total: 1, done: 0, succeeded: 0, failed: 0, cancelled: 0, active: 1 });
      await load();
    } catch (error) {
      setBusy(undefined);
      toast({ title: 'Upload failed', description: (error as Error).message, variant: 'destructive' });
    } finally {
      if (uploadRef.current) uploadRef.current.value = '';
    }
  };

  const review = async (artifactId: string, decision: 'approve' | 'reject') => {
    setArtifactBusy({ artifactId, action: decision });
    try {
      await readJson(await fetch(`/api/teachers/artifacts/${artifactId}/review`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision }),
      }));
      await load();
    } catch (error) {
      toast({ title: 'Review failed', description: (error as Error).message, variant: 'destructive' });
    } finally { setArtifactBusy(undefined); }
  };

  const validateArtifact = useCallback(async (artifactId: string, status: 'passed' | 'failed', error?: string) => {
    const validationKey = `${status}:${error ?? ''}`;
    if (validationStateRef.current.get(artifactId) === validationKey) return;
    validationStateRef.current.set(artifactId, validationKey);
    try {
      const result = await readJson(await fetch(`/api/teachers/artifacts/${artifactId}/validation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, ...(error ? { error } : {}) }),
      }));
      setData((current) => current ? {
        ...current,
        artifacts: current.artifacts.map((artifact) => artifact.id === artifactId
          ? { ...artifact, validation_report: result.validation_report }
          : artifact),
      } : current);
    } catch (validationError) {
      validationStateRef.current.delete(artifactId);
      toast({
        title: 'Could not record render validation',
        description: validationError instanceof Error ? validationError.message : 'Try previewing the artifact again.',
        variant: 'destructive',
      });
    }
  }, [toast]);

  const regenerate = async (artifactId: string) => {
    setArtifactBusy({ artifactId, action: 'regenerate' });
    try {
      const result = await readJson(await fetch(`/api/teachers/artifacts/${artifactId}/regenerate`, { method: 'POST' }));
      setBatchId(result.batchId);
      setJobProgress({ total: 1, done: 0, succeeded: 0, failed: 0, cancelled: 0, active: 1 });
    } catch (error) {
      setArtifactBusy(undefined);
      toast({ title: 'Regeneration failed', description: (error as Error).message, variant: 'destructive' });
    }
  };

  const publish = async () => {
    setBusy('publish');
    try {
      const result = await readJson(await fetch(`/api/teachers/lessons/${lessonId}/publish`, { method: 'POST' }));
      await load();
      toast({
        title: `Publication ${result.publication.version} is live`,
        description: result.warnings.length ? `${result.warnings.length} readiness warning(s) remain.` : 'Every objective has its recommended bundle.',
      });
    } catch (error) {
      toast({ title: 'Could not publish', description: (error as Error).message, variant: 'destructive' });
    } finally { setBusy(undefined); }
  };

  if (!data && loadError) {
    return (
      <div className="flex min-h-[480px] flex-col items-center justify-center rounded-3xl border border-destructive/30 bg-destructive/5 p-8 text-center">
        <p className="font-medium text-destructive">Objective Studio could not load</p>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">{loadError}</p>
        <Button type="button" variant="outline" className="mt-4" onClick={() => void load({ forceDraftSync: true })}>Try again</Button>
      </div>
    );
  }
  if (!data) return <div className="flex min-h-[480px] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-muted/30 shadow-sm">
      <div className="flex flex-col gap-4 border-b border-border bg-slate-950 px-6 py-5 text-white lg:flex-row lg:items-center lg:justify-between dark:bg-black">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-lime-300"><Zap className="h-3.5 w-3.5" /> Objective Studio</div>
          <h2 className="text-xl font-semibold tracking-tight">Build the learning experience, not just the lesson text.</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data.currentPublication && <Badge className="border-white/15 bg-white/10 text-white hover:bg-white/10">Live · v{data.currentPublication.version}</Badge>}
          <Button variant="outline" className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white" onClick={publish} disabled={busy === 'publish' || objectivesDirty} title={objectivesDirty ? 'Save objective changes before publishing' : undefined}>
            {busy === 'publish' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />} Publish lesson
          </Button>
        </div>
      </div>

      <div className="grid min-h-[680px] xl:grid-cols-[280px_minmax(0,1fr)_250px]">
        <aside className="border-b border-border bg-background p-4 xl:border-b-0 xl:border-r">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Objectives</p>
            <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label="Add objective" title="Add objective" onClick={() => updateDraftObjectives((items) => [...items, { text: '', position: items.length }])}><Plus className="h-4 w-4" /></Button>
          </div>
          <div className="space-y-2">
            {draftObjectives.map((objective, index) => {
              const persisted = 'id' in objective && objective.id;
              const count = persisted ? latestApprovedArtifacts.filter((artifact) => artifact.objective_id === objective.id && artifact.objective_revision === objective.revision).length : 0;
              return (
                <div key={objective.id ?? `new-${index}`} className={cn('group rounded-xl border p-2 transition', objective.id === activeObjectiveId ? 'border-foreground/70 bg-muted' : 'border-border bg-background')}>
                  <button className="mb-2 flex w-full items-start gap-2 text-left" onClick={() => persisted && setActiveObjectiveId(objective.id)}>
                    <span className={cn('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold', objective.id === activeObjectiveId ? 'bg-lime-300 text-slate-950' : 'bg-muted text-muted-foreground')}>{index + 1}</span>
                    <span className="line-clamp-2 text-xs font-medium leading-5 text-foreground">{objective.text || 'New objective'}</span>
                  </button>
                  <Input value={objective.text} onChange={(event) => updateDraftObjectives((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, text: event.target.value } : item))} className="h-8 text-xs" aria-label={`Objective ${index + 1}`} />
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[10px] font-medium text-muted-foreground">{count}/{recommended} approved</span>
                    <div className="flex gap-0.5 opacity-60 transition group-hover:opacity-100">
                      <Button type="button" size="icon" variant="ghost" className="h-6 w-6" aria-label={`Move objective ${index + 1} up`} title="Move up" disabled={index === 0} onClick={() => updateDraftObjectives((items) => { const copy = [...items]; [copy[index - 1], copy[index]] = [copy[index], copy[index - 1]]; return copy; })}><ArrowUp className="h-3 w-3" /></Button>
                      <Button type="button" size="icon" variant="ghost" className="h-6 w-6" aria-label={`Move objective ${index + 1} down`} title="Move down" disabled={index === draftObjectives.length - 1} onClick={() => updateDraftObjectives((items) => { const copy = [...items]; [copy[index + 1], copy[index]] = [copy[index], copy[index + 1]]; return copy; })}><ArrowDown className="h-3 w-3" /></Button>
                      <Button type="button" size="icon" variant="ghost" className="h-6 w-6 text-rose-600" aria-label={`Delete objective ${index + 1}`} title="Delete objective" disabled={draftObjectives.length === 1} onClick={() => updateDraftObjectives((items) => items.filter((_, itemIndex) => itemIndex !== index))}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <Button className="mt-4 w-full" variant="outline" onClick={saveObjectives} disabled={busy === 'save' || draftObjectives.some((objective) => !objective.text.trim())}>
            {busy === 'save' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save objectives
          </Button>
          {objectivesDirty && <p className="mt-2 text-center text-xs font-medium text-amber-700 dark:text-amber-300">Unsaved changes. Save before generating, reviewing, or publishing.</p>}
        </aside>

        <main className="p-5 lg:p-7">
          {loadError && data && <div className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"><span>Background refresh failed: {loadError}</span><Button type="button" size="sm" variant="outline" onClick={() => void load()}>Retry</Button></div>}
          {activeObjective ? (
            <>
              <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div className="max-w-2xl">
                  <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Objective {activeObjective.position + 1} · Revision {activeObjective.revision}</p>
                  <h3 className="text-2xl font-semibold leading-tight tracking-tight text-foreground">{activeObjective.text}</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                <input ref={uploadRef} type="file" className="hidden" aria-label="Upload objective media" accept="image/*,.pdf,.docx,.pptx,.txt,.csv,.xlsx" onChange={(event) => uploadMedia(event.target.files?.[0])} />
                <Button variant="outline" onClick={() => uploadRef.current?.click()} disabled={busy === 'upload' || !!batchId || objectivesDirty} title={objectivesDirty ? 'Save objective changes first' : undefined}>{busy === 'upload' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}Upload media</Button>
                <Button className="bg-lime-300 text-slate-950 hover:bg-lime-200" onClick={generateBundle} disabled={busy === 'generate' || !!batchId || objectivesDirty} title={objectivesDirty ? 'Save objective changes first' : undefined}>
                  {batchId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                  {batchId ? `Generating ${jobProgress?.done ?? 0}/${jobProgress?.total ?? 5}` : activeArtifacts.length ? 'Generate another bundle' : 'Generate objective bundle'}
                </Button>
                </div>
              </div>

              {activeArtifacts.length ? (
                <div className="space-y-5">
                  {activeArtifacts.map((artifact) => (
                    <Card key={artifact.id} className="overflow-hidden border-border shadow-none">
                      <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-border bg-card px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-foreground">{artifact.kind === 'generated_image' ? <ImageIcon className="h-4 w-4" /> : artifact.kind.includes('quiz') ? <CheckCircle2 className="h-4 w-4" /> : <Zap className="h-4 w-4" />}</div>
                          <div><CardTitle className="text-sm">{artifactLabels[artifact.kind]}</CardTitle><p className="mt-0.5 text-xs text-muted-foreground">Version {artifact.version}</p></div>
                        </div>
                        <Badge variant={artifact.status === 'approved' ? 'success' : artifact.status === 'rejected' ? 'destructive' : 'secondary'}>{artifact.status}</Badge>
                      </CardHeader>
                      <CardContent className="bg-muted/30 p-5"><ArtifactPreview artifact={artifact} onValidation={(status, error) => void validateArtifact(artifact.id, status, error)} /></CardContent>
                      {(artifact.status === 'draft' || artifact.kind !== 'uploaded_media') && (
                        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-card px-5 py-3">
                          {['interactive_visualization', 'visual_quiz'].includes(artifact.kind) && artifact.status === 'draft' && <span className={cn('mr-auto text-xs font-medium', artifact.validation_report?.status === 'passed' && artifact.validation_report?.validator === 'sandbox-runtime' ? 'text-emerald-700 dark:text-emerald-400' : artifact.validation_report?.status === 'failed' ? 'text-destructive' : 'text-muted-foreground')}>{artifact.validation_report?.status === 'passed' ? 'Render verified' : artifact.validation_report?.status === 'failed' ? 'Render failed' : 'Validating render…'}</span>}
                          {artifact.status === 'draft' && <Button size="sm" variant="ghost" className="text-rose-700 dark:text-rose-400" onClick={() => review(artifact.id, 'reject')} disabled={artifactBusy?.artifactId === artifact.id || objectivesDirty}>{isArtifactActionBusy(artifactBusy, artifact.id, 'reject') ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <X className="mr-1.5 h-4 w-4" />}Reject</Button>}
                          {artifact.kind !== 'uploaded_media' && <Button size="sm" variant="outline" onClick={() => regenerate(artifact.id)} disabled={artifactBusy?.artifactId === artifact.id || !!batchId || objectivesDirty}>{isArtifactActionBusy(artifactBusy, artifact.id, 'regenerate') ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}Regenerate</Button>}
                          {artifact.status === 'draft' && <Button size="sm" className="bg-slate-950 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200" onClick={() => review(artifact.id, 'approve')} disabled={artifactBusy?.artifactId === artifact.id || objectivesDirty || (['interactive_visualization', 'visual_quiz'].includes(artifact.kind) && !(artifact.validation_report?.status === 'passed' && artifact.validation_report?.validator === 'sandbox-runtime'))}>{isArtifactActionBusy(artifactBusy, artifact.id, 'approve') ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}Approve</Button>}
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="flex min-h-[410px] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-background/70 px-6 text-center">
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-lime-200"><Sparkles className="h-6 w-6 text-slate-900" /></div>
                  <h4 className="font-semibold text-foreground">This objective is ready for its learning kit</h4>
                  <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">Generate two interactives, one illustration, a five-question knowledge check, and a visual challenge.</p>
                </div>
              )}
            </>
          ) : <div className="flex min-h-[480px] items-center justify-center text-sm text-muted-foreground">Save and select an objective to begin.</div>}
        </main>

        <aside className="border-t border-border bg-background p-5 xl:border-l xl:border-t-0">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Readiness</p>
          <div className="my-5 flex items-end gap-2"><span className="text-4xl font-semibold tracking-tight text-foreground">{approved}</span><span className="pb-1 text-sm text-muted-foreground">of {recommended} approved</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-lime-400 transition-all" style={{ width: `${Math.min(100, (approved / recommended) * 100)}%` }} /></div>
          <div className="mt-6 space-y-3">
            {[
              ['2 interactives', approvedArtifacts.filter((item) => item.kind === 'interactive_visualization').length >= 2],
              ['1 illustration', approvedArtifacts.some((item) => item.kind === 'generated_image')],
              ['1 knowledge check', approvedArtifacts.some((item) => item.kind === 'structured_quiz')],
              ['1 visual challenge', approvedArtifacts.some((item) => item.kind === 'visual_quiz')],
            ].map(([label, complete]) => <div key={String(label)} className="flex items-center gap-2 text-sm text-muted-foreground">{complete ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <CircleDashed className="h-4 w-4 text-muted-foreground/40" />}{label}</div>)}
          </div>
          <div className="mt-7 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">Publishing is never blocked by missing items. Students receive approved artifacts first, then can ask the tutor to generate more after they run out.</div>
        </aside>
      </div>
    </div>
  );
}
