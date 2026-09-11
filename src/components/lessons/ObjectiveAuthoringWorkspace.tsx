'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Circle, ImageIcon, List, Loader2, Sparkles, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { shouldApplyRemoteObjectives, summarizeContentJobs, type ArtifactBusyState, type ContentJobSummary } from '@/lib/lesson-artifacts/authoring-ui';
import { getStudioMaterials, latestStudioArtifacts, type StudioArtifact as Artifact } from '@/lib/lesson-artifacts/studio-state';
import { StudioArtifactReview } from './StudioArtifactReview';
import { StudioDirections } from './StudioDirections';
type Objective = { id: string; text: string; position: number; revision: number; visualInstructions: string };
type Concept = { revision: number; concept: string };
type Step = 'direction' | 'lesson' | 'objective' | 'publish';
type AuthoringData = {
  viewerId: string;
  lesson: { id: string; title: string; subject: string; gradeLevel: string; content: string | null; visualInstructions: string; visualRevision: number };
  objectives: Objective[];
  artifacts: Artifact[];
  creativeConcepts?: Record<string, Concept>;
  activeBatchId?: string | null;
  currentPublication: { id: string; version: number; warnings: string[]; published_at: string } | null;
};
async function readJson(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}
export function ObjectiveAuthoringWorkspace({ lessonId }: { lessonId: string }) {
  const { toast } = useToast();
  const [data, setData] = useState<AuthoringData>();
  const [loadError, setLoadError] = useState<string>();
  const [draftObjectives, setDraftObjectives] = useState<Array<{ id?: string; text: string; visualInstructions?: string }>>([]);
  const [visualInstructions, setVisualInstructions] = useState('');
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [objectivesDirty, setObjectivesDirty] = useState(false);
  const [activeObjectiveId, setActiveObjectiveId] = useState<string>();
  const [busy, setBusy] = useState<string>();
  const [artifactBusy, setArtifactBusy] = useState<ArtifactBusyState>();
  const [batchId, setBatchId] = useState<string>();
  const [jobProgress, setJobProgress] = useState<ContentJobSummary>();
  const uploadRef = useRef<HTMLInputElement>(null);
  const objectivesDirtyRef = useRef(false);
  const validationStateRef = useRef(new Map<string, string>());
  const [step, setStep] = useState<Step>('direction');
  const [materialKey, setMaterialKey] = useState('concept');
  const [selectedSeries, setSelectedSeries] = useState('');
  const [historicalId, setHistoricalId] = useState('');
  const [showOutline, setShowOutline] = useState(false);
  const [editIndex, setEditIndex] = useState(0);
  const [conceptDrafts, setConceptDrafts] = useState<Record<string, Concept>>({});
  const [conceptBusyId, setConceptBusyId] = useState<string>();
  const [conceptError, setConceptError] = useState<string>();
  const [storageReady, setStorageReady] = useState('');
  const restoredKey = useRef('');
  const loadSequenceRef = useRef(0);
  const syncDraftsRef = useRef(false);
  const restoreJobsRef = useRef(false);
  const dataRef = useRef<AuthoringData | undefined>(undefined);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const moveFocusRef = useRef(false);
  const selectionToken = `${step}:${activeObjectiveId}:${materialKey}`;
  const selectionRef = useRef(selectionToken);
  useEffect(() => { selectionRef.current = selectionToken; }, [selectionToken]);

  const setDirty = useCallback((dirty: boolean) => {
    objectivesDirtyRef.current = dirty;
    setObjectivesDirty(dirty);
  }, []);

  const updateDraftObjectives = useCallback((update: (items: typeof draftObjectives) => typeof draftObjectives) => {
    setDraftObjectives((items) => update(items));
    setDirty(true);
  }, [setDirty]);

  const load = useCallback(async ({ forceDraftSync = false, restoreJobs = false }: { forceDraftSync?: boolean; restoreJobs?: boolean } = {}) => {
    const sequence = ++loadSequenceRef.current;
    syncDraftsRef.current ||= forceDraftSync;
    restoreJobsRef.current ||= restoreJobs;
    try {
      const next = await readJson(await fetch(`/api/teachers/lessons/${lessonId}/authoring`, { cache: 'no-store' }));
      if (sequence !== loadSequenceRef.current) return;
      setData(next);
      dataRef.current = next;
      setLoadError(undefined);
      if (shouldApplyRemoteObjectives({ dirty: objectivesDirtyRef.current, force: syncDraftsRef.current })) {
        setDraftObjectives(next.objectives);
        setVisualInstructions(next.lesson.visualInstructions ?? '');
        setDirty(false);
        syncDraftsRef.current = false;
      }
      setActiveObjectiveId((current) => current && next.objectives.some((item: Objective) => item.id === current) ? current : next.objectives[0]?.id);
      if (restoreJobsRef.current) { setBatchId(next.activeBatchId ?? undefined); restoreJobsRef.current = false; }
      const key = next.viewerId ? `insyte:studio:${next.viewerId}:${lessonId}` : '';
      if (key && restoredKey.current !== key) {
    restoredKey.current = key;
    try {
      const saved = JSON.parse(localStorage.getItem(key) || '{}');
      if (['direction', 'lesson', 'objective', 'publish'].includes(saved.step)) setStep(saved.step);
      if (typeof saved.objectiveId === 'string' && dataRef.current?.objectives.some(item => item.id === saved.objectiveId)) setActiveObjectiveId(saved.objectiveId);
      if (typeof saved.materialKey === 'string') setMaterialKey(saved.materialKey);
      if (typeof saved.series === 'string') setSelectedSeries(saved.series);
      if (typeof saved.version === 'string') setHistoricalId(saved.version);
      const drafts: Record<string, Concept> = {};
      for (const [id, candidate] of Object.entries(saved.concepts ?? {})) {
        const item = candidate as Partial<Concept> | null;
        if (item && typeof item.concept === 'string' && item.concept.length <= 4000 && Number.isInteger(item.revision)) drafts[id] = item as Concept;
      }
      setConceptDrafts(drafts);
    } catch { /* Browser storage is optional; server-saved work remains available. */ }
    setStorageReady(key);
      }
    } catch (error) {
      if (sequence !== loadSequenceRef.current) return;
      setLoadError(error instanceof Error ? error.message : 'Could not load Objective Studio');
      throw error;
    }
  }, [lessonId, setDirty]);

  useEffect(() => {
    queueMicrotask(() => load({ forceDraftSync: true, restoreJobs: true }).catch((error) => toast({ title: 'Could not load Objective Studio', description: error.message, variant: 'destructive' })));
  }, [load, toast]);

  const storageKey = data?.viewerId ? `insyte:studio:${data.viewerId}:${lessonId}` : '';
  useEffect(() => {
    if (!storageKey || storageReady !== storageKey) return;
    try { localStorage.setItem(storageKey, JSON.stringify({ step, objectiveId: activeObjectiveId, materialKey, series: selectedSeries, version: historicalId, concepts: conceptDrafts })); }
    catch { /* A blocked local store must not prevent authoring. */ }
  }, [storageKey, storageReady, step, activeObjectiveId, materialKey, selectedSeries, historicalId, conceptDrafts]);
  useEffect(() => {
    if (moveFocusRef.current) { headingRef.current?.focus(); moveFocusRef.current = false; }
  }, [selectionToken]);

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
    let polling = false;
    let previousDone = -1;
    const poll = async () => {
      if (stopped || polling) return;
      polling = true;
      try {
        const result = await readJson(await fetch(`/api/content-jobs?batchId=${batchId}`, { cache: 'no-store' }));
        if (stopped) return;
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
          await load({ restoreJobs: true });
          if (summary.failed || summary.cancelled) {
            toast({
              title: 'Generation completed with issues',
              description: `${summary.succeeded} succeeded, ${summary.failed} failed, and ${summary.cancelled} cancelled. You can generate again to retry.`,
              variant: 'destructive',
            });
          } else {
            toast({ title: 'Content ready for review', description: 'Preview each item before approving it.' });
          }
        } else if (summary.done !== previousDone) {
          previousDone = summary.done;
          await load();
        }
      } catch (error) {
        failures += 1;
        if (failures >= 3) {
          stopped = true;
          setBatchId(undefined);
          setBusy(undefined);
          setArtifactBusy(undefined);
          setLoadError('Generation status is unavailable. Refresh to reconnect to existing jobs.');
          toast({ title: 'Generation status unavailable', description: error instanceof Error ? error.message : 'Refresh to reconnect to existing jobs.', variant: 'destructive' });
        }
      } finally { polling = false; }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 2_500);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [batchId, load, toast]);

  const artifacts = data?.artifacts ?? [];
  const activeObjective = data?.objectives.find(item => item.id === activeObjectiveId);
  const materials = useMemo(() => getStudioMaterials(data?.artifacts ?? [], activeObjectiveId ?? '', activeObjective?.revision ?? 0), [data?.artifacts, activeObjectiveId, activeObjective?.revision]);
  const currentMaterial = materials.find(item => item.key === materialKey) ?? materials[0];
  const lessonArtifacts = artifacts.filter(item => item.objective_id === null && item.payload.kind === 'generated_image' && item.payload.introductionFor === 'lesson');
  const lessonApproved = lessonArtifacts.some(item => item.status === 'approved' && item.objective_revision === data?.lesson.visualRevision);
  const choices = step === 'lesson' ? latestStudioArtifacts(lessonArtifacts).sort((a, b) => Number(b.objective_revision === data?.lesson.visualRevision) - Number(a.objective_revision === data?.lesson.visualRevision)) : currentMaterial.artifacts;
  const selectedArtifact = choices.find(item => item.series_id === selectedSeries) ?? choices[0];
  const savedConcept = activeObjective && data?.creativeConcepts?.[activeObjective.id];
  const localConcept = activeObjective && conceptDrafts[activeObjective.id];
  const concept = activeObjective && localConcept?.revision === activeObjective.revision ? localConcept.concept : activeObjective && savedConcept?.revision === activeObjective.revision ? savedConcept.concept : '';
  const suggesting = !!conceptBusyId && conceptBusyId === activeObjectiveId;
  const generationDisabled = !!busy || !!batchId || objectivesDirty;
  const mutationDisabled = !!busy || (!!artifactBusy && artifactBusy.action !== 'regenerate') || objectivesDirty;
  const navigate = (nextStep: Step, objectiveId = activeObjectiveId, nextMaterial = 'concept') => {
    selectionRef.current = `${nextStep}:${objectiveId}:${nextMaterial}`;
    setStep(nextStep); setActiveObjectiveId(objectiveId); setMaterialKey(nextMaterial); setSelectedSeries(''); setHistoricalId(''); setShowOutline(false); setConceptError(undefined);
  };
  const advance = () => {
    if (selectionRef.current !== selectionToken) return;
    moveFocusRef.current = true;
    if (step === 'lesson') { navigate(data?.objectives.length ? 'objective' : 'publish', data?.objectives[0]?.id); return; }
    const index = materials.findIndex(item => item.key === currentMaterial.key);
    if (index < materials.length - 1) { navigate('objective', activeObjectiveId, materials[index + 1].key); return; }
    const objectiveIndex = data?.objectives.findIndex(item => item.id === activeObjectiveId) ?? -1;
    const next = data?.objectives[objectiveIndex + 1];
    navigate(next ? 'objective' : 'publish', next?.id);
  };
  const suggestConcept = async () => {
    if (!activeObjective || objectivesDirty) return;
    const objective = activeObjective;
    setConceptBusyId(objective.id); setConceptError(undefined);
    try {
      const result = await readJson(await fetch(`/api/teachers/objectives/${objective.id}/creative-concept`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ objectiveRevision: objective.revision, ...(concept ? { previousConcept: concept } : {}) }) }));
      if (dataRef.current?.objectives.find(item => item.id === objective.id)?.revision === result.objectiveRevision) setConceptDrafts(current => ({ ...current, [objective.id]: { revision: result.objectiveRevision, concept: result.creativeConcept } }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not suggest a concept';
      if (selectionRef.current.includes(objective.id)) setConceptError(message);
      toast({ title: 'Concept suggestion failed', description: message, variant: 'destructive' });
    } finally { setConceptBusyId(undefined); }
  };

  const saveObjectives = async () => {
    if (!data) return false;
    setBusy('save');
    try {
      await readJson(await fetch(`/api/teachers/lessons/${lessonId}/authoring`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data.lesson, visualInstructions, objectives: draftObjectives.map(({ id, text, visualInstructions }) => ({ id, text, visualInstructions: visualInstructions ?? '' })) }),
      }));
      await load({ forceDraftSync: true });
      toast({ title: 'Lesson directions saved', description: 'Changed objectives and visual directions are ready for generation.' });
      return true;
    } catch (error) {
      toast({ title: 'Could not save lesson directions', description: (error as Error).message, variant: 'destructive' });
      return false;
    } finally { setBusy(undefined); }
  };

  const generateBundle = async (introduction = false) => {
    if (!introduction && !activeObjective) return;
    const token = selectionToken;
    setBusy('generate');
    try {
      const result = await readJson(await fetch(introduction ? `/api/teachers/lessons/${lessonId}/generate-introduction` : `/api/teachers/objectives/${activeObjectiveId}/generate-bundle`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(introduction ? {} : { creativeConcept: concept, objectiveRevision: activeObjective!.revision }),
      }));
      setBatchId(result.batchId);
      setJobProgress({ total: result.jobs.length, done: 0, succeeded: 0, failed: 0, cancelled: 0, active: result.jobs.length });
      if (!introduction && selectionRef.current === token) { moveFocusRef.current = true; navigate('objective', activeObjectiveId, 'introduction'); }
    } catch (error) {
      setBusy(undefined);
      toast({ title: 'Could not start generation', description: (error as Error).message, variant: 'destructive' });
    } finally { setBusy(undefined); }
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
      setBusy(undefined);
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
      return true;
    } catch (error) {
      toast({ title: 'Review failed', description: (error as Error).message, variant: 'destructive' });
      return false;
    } finally { setArtifactBusy(undefined); }
  };

  const validateArtifact = useCallback(async (artifactId: string, status: 'passed' | 'failed', error?: string) => {
    if (dataRef.current?.artifacts.find(artifact => artifact.id === artifactId)?.status !== 'draft') return;
    const validationKey = `${status}:${error ?? ''}`;
    if (validationStateRef.current.get(artifactId) === validationKey) return;
    validationStateRef.current.set(artifactId, validationKey);
    try {
      await readJson(await fetch(`/api/teachers/artifacts/${artifactId}/validation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, ...(error ? { error } : {}) }),
      }));
      await load();
    } catch (validationError) {
      validationStateRef.current.delete(artifactId);
      toast({
        title: 'Could not record render validation',
        description: validationError instanceof Error ? validationError.message : 'Try previewing the artifact again.',
        variant: 'destructive',
      });
    }
  }, [load, toast]);

  const regenerate = async (artifactId: string) => {
    setArtifactBusy({ artifactId, action: 'regenerate' });
    try {
      const result = await readJson(await fetch(`/api/teachers/artifacts/${artifactId}/regenerate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ feedback: feedback[artifactId] ?? '' }) }));
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


  if (!data) return <div className="flex min-h-96 flex-col items-center justify-center gap-4 rounded-2xl border p-8 text-center">{loadError ? <><p role="alert" className="text-destructive">{loadError}</p><Button variant="outline" onClick={() => void load({ forceDraftSync: true, restoreJobs: true }).catch(() => undefined)}>Try again</Button></> : <><Loader2 className="h-6 w-6 animate-spin" /><p className="text-sm text-muted-foreground">Opening Objective Studio…</p></>}</div>;
  const readiness = data.objectives.map(objective => ({ objective, materials: getStudioMaterials(artifacts, objective.id, objective.revision) }));
  const requiredReady = lessonApproved && readiness.every(item => item.materials[0].approved);
  const approvedCount = Number(lessonApproved) + readiness.reduce((sum, item) => sum + item.materials.slice(0, 5).filter(material => material.approved).length, 0);
  const total = 1 + data.objectives.length * 5;
  const title = step === 'direction' ? 'Set the direction' : step === 'lesson' ? 'Introduce the lesson' : step === 'publish' ? 'Ready for your students?' : materialKey === 'concept' ? 'Choose a creative concept' : currentMaterial.label;
  const navClass = (active: boolean) => cn('flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', active ? 'bg-primary/10 font-semibold text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground');
  const status = (complete: boolean) => complete ? <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" /> : <Circle className="h-4 w-4 shrink-0 text-muted-foreground/50" />;
  const renderFocusedArtifact = () => selectedArtifact ? <>
    {choices.length > 1 && <label className="mb-4 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">Material alternatives<select disabled={mutationDisabled} aria-label="Material alternatives" className="rounded-lg border bg-background p-2 text-foreground" value={selectedArtifact.series_id} onChange={event => { setSelectedSeries(event.target.value); setHistoricalId(''); }}>{choices.map((item, index) => <option key={item.series_id} value={item.series_id}>Option {choices.length - index} · {item.status}{item.objective_revision !== (step === 'lesson' ? data.lesson.visualRevision : activeObjective?.revision) ? ' · earlier directions' : ''}</option>)}</select></label>}
    <StudioArtifactReview key={selectedArtifact.id} artifact={selectedArtifact} versions={artifacts.filter(item => item.series_id === selectedArtifact.series_id)} revision={step === 'lesson' ? data.lesson.visualRevision : activeObjective?.revision ?? 0} disabled={mutationDisabled || artifactBusy?.artifactId === selectedArtifact.id} generating={!!batchId} historicalId={historicalId} onHistory={setHistoricalId} feedback={feedback[selectedArtifact.id] ?? ''} onFeedback={text => setFeedback(current => ({ ...current, [selectedArtifact.id]: text }))} onReview={review} onRegenerate={regenerate} onValidation={validateArtifact} onContinue={advance} />
  </> : <div className="flex min-h-80 flex-col items-center justify-center rounded-2xl border border-dashed px-6 text-center"><ImageIcon className="mb-4 h-9 w-9 text-muted-foreground/50" /><h4 className="text-lg font-medium">{batchId ? 'Your material is on its way' : 'Bring this idea to life'}</h4><p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{batchId ? 'Generation continues in the background. You can review other steps while you wait.' : step === 'lesson' ? 'Generate a visual introduction using your lesson directions.' : 'Choose a creative concept to generate the five materials for this objective.'}</p>{!batchId && <Button className="mt-6" disabled={generationDisabled} onClick={() => step === 'lesson' ? void generateBundle(true) : navigate('objective', activeObjectiveId, 'concept')}><Sparkles className="mr-2 h-4 w-4" />{step === 'lesson' ? 'Generate introduction' : 'Choose concept'}</Button>}</div>;

  return <div className="overflow-hidden rounded-2xl border bg-background">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b px-5 py-5 sm:px-7"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Objective Studio</p><p className="mt-1 text-sm text-muted-foreground">Shape the experience, one step at a time.</p></div><div className="flex flex-wrap items-center gap-3"><span className="text-xs text-muted-foreground">{approvedCount}/{total} approved</span>{data.currentPublication && <Badge variant="outline">Live · v{data.currentPublication.version}</Badge>}<Button variant="outline" size="sm" className="lg:hidden" aria-expanded={showOutline} aria-controls="studio-outline" onClick={() => setShowOutline(value => !value)}><List className="mr-2 h-4 w-4" />Outline</Button></div></header>
    {batchId && <div role="status" className="flex flex-wrap items-center gap-3 border-b bg-primary/5 px-5 py-3 text-sm"><Loader2 className="h-4 w-4 animate-spin text-primary" /><span>Preparing materials · {jobProgress?.done ?? 0}/{jobProgress?.total ?? 5} finished</span><span className="text-muted-foreground">You can keep reviewing.</span></div>}
    {loadError && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border-b bg-destructive/5 p-4 text-sm text-destructive"><span>{loadError}</span><Button variant="outline" size="sm" onClick={() => void load({ restoreJobs: true }).catch(() => undefined)}>Refresh</Button></div>}
    {objectivesDirty && step !== 'direction' && <div role="status" className="flex flex-wrap items-center justify-between gap-3 border-b bg-amber-500/10 p-4 text-sm"><span>Save your direction changes before generating, approving, or publishing.</span><Button variant="outline" size="sm" onClick={() => navigate('direction')}>Review directions</Button></div>}
    <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside id="studio-outline" className={cn('border-b bg-muted/20 p-3 lg:block lg:border-b-0 lg:border-r', !showOutline && 'hidden')}><nav aria-label="Lesson creation outline" className="space-y-1 lg:sticky lg:top-4">
        <button className={navClass(step === 'direction')} aria-current={step === 'direction' ? 'step' : undefined} onClick={() => navigate('direction')}>{status(!objectivesDirty)}<span>Lesson direction</span></button>
        <button className={navClass(step === 'lesson')} aria-current={step === 'lesson' ? 'step' : undefined} onClick={() => navigate('lesson')}>{status(lessonApproved)}<span>Lesson introduction</span></button>
        <p className="px-3 pb-1 pt-5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Objectives</p>
        {readiness.map(({ objective, materials: items }, index) => <div key={objective.id}><button className={navClass(step === 'objective' && activeObjectiveId === objective.id)} aria-current={step === 'objective' && activeObjectiveId === objective.id ? 'step' : undefined} onClick={() => navigate('objective', objective.id)}><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px]">{items.slice(0, 5).every(item => item.approved) ? <Check className="h-3 w-3" /> : index + 1}</span><span className="min-w-0"><span className="line-clamp-2 leading-5">{objective.text}</span><span className="mt-1 block text-[10px] font-normal text-muted-foreground">{items.slice(0, 5).filter(item => item.approved).length}/5 approved</span></span></button>
          {step === 'objective' && activeObjectiveId === objective.id && <div className="mb-3 ml-5 border-l pl-2"><button className={navClass(materialKey === 'concept')} onClick={() => navigate('objective', objective.id, 'concept')}><Sparkles className="h-3.5 w-3.5" />Creative concept</button>{items.map(item => <button key={item.key} className={navClass(materialKey === item.key)} aria-current={materialKey === item.key ? 'step' : undefined} onClick={() => navigate('objective', objective.id, item.key)}>{status(item.approved)}<span>{item.label}</span></button>)}</div>}
        </div>)}
        <div className="pt-4"><button className={navClass(step === 'publish')} aria-current={step === 'publish' ? 'step' : undefined} onClick={() => navigate('publish')}><CheckCircle2 className="h-4 w-4" />Review & publish</button></div>
      </nav></aside>
      <section aria-label="Current Studio step" className="min-w-0 p-4 sm:p-7">
        <div className="mb-6"><p className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">{step === 'objective' && activeObjective ? `Objective ${activeObjective.position + 1} · ${materialKey === 'concept' ? 'Creative direction' : `${materials.findIndex(item => item.key === currentMaterial.key) + 1} of ${materials.length}`}` : 'Your lesson'}</p><h3 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold tracking-tight outline-none">{title}</h3>{step === 'objective' && activeObjective && <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">{activeObjective.text}</p>}{step === 'lesson' && <p className="mt-3 text-sm text-muted-foreground">Give students the big picture before they begin.</p>}</div>
        {step === 'direction' && <StudioDirections instructions={visualInstructions} objectives={draftObjectives} editIndex={editIndex} onEditIndex={setEditIndex} onInstructions={text => { setVisualInstructions(text); setDirty(true); }} onObjectives={items => updateDraftObjectives(() => items)} dirty={objectivesDirty} saving={busy === 'save'} disabled={!!busy || !!batchId} onContinue={async () => { if (!objectivesDirty || await saveObjectives()) { moveFocusRef.current = true; navigate('lesson'); } }} />}
        {step === 'lesson' && <div className="space-y-5">{renderFocusedArtifact()}{choices.length > 0 && <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">Try a different introduction</summary><div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"><p className="text-sm text-muted-foreground">Generate another idea using your saved lesson directions.</p><Button variant="outline" disabled={generationDisabled} onClick={() => void generateBundle(true)}><Sparkles className="mr-2 h-4 w-4" />Generate another idea</Button></div></details>}</div>}
        {step === 'objective' && activeObjective && <>
          {materialKey === 'concept' ? <div className="space-y-5"><p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">Choose a setting and a connected sequence of experiences. Each material will use this concept, with a different way to explore or apply the idea.</p>
            <div className="rounded-2xl border bg-muted/20 p-5 sm:p-6"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><label htmlFor="creative-concept" className="font-medium">Your teaching concept</label><Button variant="outline" size="sm" disabled={generationDisabled || !!conceptBusyId} onClick={() => void suggestConcept()}>{suggesting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}{suggesting ? 'Imagining possibilities…' : concept ? 'Try another idea' : 'Suggest a concept'}</Button></div><Textarea id="creative-concept" maxLength={4000} value={concept} disabled={suggesting || !!busy} onChange={event => setConceptDrafts(current => ({ ...current, [activeObjective.id]: { revision: activeObjective.revision, concept: event.target.value } }))} className="min-h-64 bg-background text-sm leading-7" placeholder="Ask for a suggestion, or describe your own concept. Include a memorable setting, an opening diagram, an exploration, a different application, and a visual challenge." /><p className="mt-3 text-xs text-muted-foreground">{concept.length}/4000 · Editable before generation. Saved on this device until accepted.</p>{conceptError && <p role="alert" className="mt-3 text-sm text-destructive">{conceptError}</p>}</div>
            <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">Saved directions for this objective</summary><div className="mt-3 space-y-3 rounded-xl border p-4"><p className="whitespace-pre-wrap leading-relaxed">{activeObjective.visualInstructions || 'No specific directions. The AI can choose suitable examples and interactions.'}</p><Button variant="outline" size="sm" onClick={() => { setEditIndex(activeObjective.position); navigate('direction'); }}>Edit directions</Button></div></details>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-5">{materials.some(item => item.artifacts.length) ? <Button variant="ghost" onClick={() => navigate('objective', activeObjectiveId, 'introduction')}>Review existing materials<ArrowRight className="ml-2 h-4 w-4" /></Button> : <p className="text-xs text-muted-foreground">Five materials will generate in the background.</p>}<Button disabled={generationDisabled || suggesting || concept.trim().length < 20} onClick={() => void generateBundle()}>{busy === 'generate' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}Accept & generate materials</Button></div>
          </div> : <div className="space-y-5"><p className="text-sm text-muted-foreground">{currentMaterial.description}</p>{renderFocusedArtifact()}<div className="flex flex-wrap items-center justify-between gap-2"><Button variant="ghost" size="sm" onClick={() => navigate('objective', activeObjectiveId, materials[materials.findIndex(item => item.key === currentMaterial.key) - 1]?.key ?? 'concept')}><ArrowLeft className="mr-2 h-4 w-4" />Previous step</Button><Button variant="ghost" size="sm" onClick={advance}>Review later<ArrowRight className="ml-2 h-4 w-4" /></Button></div></div>}
          <details className="mt-7 border-t pt-4 text-sm"><summary className="cursor-pointer text-muted-foreground">Add supporting resources</summary><div className="mt-3 flex flex-wrap items-center justify-between gap-3"><p className="text-muted-foreground">Upload a diagram, document, or other teacher resource.</p><input ref={uploadRef} type="file" className="hidden" aria-label="Upload objective media" accept="image/*,.pdf,.docx,.pptx,.txt,.csv,.xlsx" onChange={event => void uploadMedia(event.target.files?.[0])} /><Button size="sm" variant="outline" disabled={generationDisabled} onClick={() => uploadRef.current?.click()}><Upload className="mr-2 h-4 w-4" />Upload resource</Button></div></details>
        </>}
        {step === 'publish' && <div className="space-y-6"><p className="max-w-xl text-sm leading-relaxed text-muted-foreground">Check the introductions and reviewed materials below. Your current publication stays available until you publish these changes.</p><button className="flex w-full items-center justify-between gap-4 rounded-xl border p-4 text-left" onClick={() => navigate('lesson')}><span className="flex items-center gap-3">{status(lessonApproved)}Lesson introduction</span><span className="text-xs text-muted-foreground">{lessonApproved ? 'Approved' : 'Required'}</span></button>{readiness.map(({ objective, materials: items }) => <section key={objective.id} className="rounded-xl border p-5"><p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Objective {objective.position + 1}</p><h4 className="text-sm font-medium leading-relaxed">{objective.text}</h4><div className="mt-4 grid gap-2 sm:grid-cols-2">{items.map(item => <button key={item.key} className="flex items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-muted" onClick={() => navigate('objective', objective.id, item.key)}>{status(item.approved)}<span>{item.label}</span><span className="ml-auto text-xs text-muted-foreground">{item.approved ? 'Ready' : item.key === 'introduction' ? 'Required' : 'Recommended'}</span></button>)}</div></section>)}{!requiredReady && <p role="status" className="rounded-xl bg-amber-500/10 p-4 text-sm">Approve a current introduction for the lesson and every objective before publishing. Other materials are recommended.</p>}<div className="flex flex-wrap items-center justify-between gap-3 border-t pt-5"><p className="text-sm text-muted-foreground">{approvedCount} of {total} recommended materials approved.</p><Button disabled={!requiredReady || mutationDisabled || !!batchId} onClick={() => void publish()}>{busy === 'publish' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}{data.currentPublication ? 'Publish reviewed changes' : 'Publish lesson'}</Button></div></div>}
      </section>
    </div>
  </div>;
}
