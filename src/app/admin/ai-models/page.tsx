'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { homeworkRequest, useHomeworkData } from '@/components/homework/shared';
import { AdminPageHeader, LoadState, Pill, formatDateTime } from '@/components/admin/AdminParts';
import {
  AI_MODEL_KEYS,
  LIVE_VOICES,
  PROVIDER_LABEL,
  cleanSetting,
  type AiModelKey,
  type AiModelSettings,
  type AiModelsView,
  type ResolvedSetting,
} from '@/lib/ai-models';
import { cn } from '@/lib/utils';

const USE_FALLBACK = '__fallback__';

type Draft = Record<AiModelKey, string>;

const toDraft = (saved: AiModelSettings): Draft =>
  Object.fromEntries(AI_MODEL_KEYS.map((k) => [k, saved[k] ?? ''])) as Draft;

function sourceText(r: Pick<ResolvedSetting, 'source' | 'envVar'>, value: string | null) {
  switch (r.source) {
    case 'admin':
      return 'set here';
    case 'env':
      return `from ${r.envVar}`;
    case 'default':
      return 'built-in default';
    case 'agent':
      return 'decided on the co-teacher server';
    default:
      return value ? '' : 'not set';
  }
}

/** "Clear to use gemini-2.5-flash (from GEMINI_MODEL)". */
function fallbackText(r: ResolvedSetting) {
  if (r.fallbackSource === 'agent') return 'the co-teacher server’s own setting (GEMINI_LIVE_MODEL, then gemini-3.8-live; voice GEMINI_VOICE, then Zephyr)';
  if (!r.fallback) return 'nothing, so this feature stops working';
  return `${r.fallback} (${sourceText({ source: r.fallbackSource, envVar: r.envVar }, r.fallback)})`;
}

/** Model ids a provider offers, loaded once per provider. */
function useModelLists(providers: string[]) {
  const [lists, setLists] = useState<Record<string, { models: string[]; note?: string } | 'loading'>>({});
  const asked = useRef(new Set<string>());
  const key = providers.join(',');
  useEffect(() => {
    for (const provider of key.split(',').filter(Boolean)) {
      if (asked.current.has(provider)) continue;
      asked.current.add(provider);
      setLists((p) => ({ ...p, [provider]: 'loading' }));
      homeworkRequest<{ models: string[]; note?: string }>(`/api/admin/ai-models/available?provider=${encodeURIComponent(provider)}`)
        .then((data) => setLists((p) => ({ ...p, [provider]: data })))
        .catch(() => setLists((p) => ({ ...p, [provider]: { models: [], note: 'Couldn’t load the model list. You can still type a model name.' } })));
    }
  }, [key]);
  return lists;
}

export default function AdminAiModelsPage() {
  const view = useHomeworkData<AiModelsView>('/api/admin/ai-models');
  const [data, setData] = useState<AiModelsView | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { toast } = useToast();

  // Take each freshly loaded copy as the starting point (set during render, not in an effect).
  const [loaded, setLoaded] = useState<AiModelsView | null>(null);
  if (view.data && view.data !== loaded) {
    setLoaded(view.data);
    setData(view.data);
    setDraft(toDraft(view.data.saved));
  }

  const changed = useMemo(() => {
    if (!data || !draft) return [] as AiModelKey[];
    return AI_MODEL_KEYS.filter((k) => draft[k].trim() !== (data.saved[k] ?? ''));
  }, [data, draft]);

  const invalid = useMemo(() => {
    const out: Partial<Record<AiModelKey, string>> = {};
    if (!draft) return out;
    for (const k of changed) {
      const result = cleanSetting(k, draft[k]);
      if (!result.ok) out[k] = result.error;
    }
    return out;
  }, [changed, draft]);

  // The provider each model field is for, as it would be after saving.
  const effectiveProvider = (key: 'textProvider' | 'visualProvider') =>
    (draft?.[key].trim().toUpperCase() || data?.resolved[key].fallback || 'GEMINI');
  const textProvider = effectiveProvider('textProvider');
  const visualProvider = effectiveProvider('visualProvider');
  const lists = useModelLists(data ? Array.from(new Set([textProvider, visualProvider, 'GEMINI'])) : []);

  // Switching provider while the model is blank means the model comes from the new provider's env var.
  const providerChangeWarning = (providerKey: 'textProvider' | 'visualProvider', modelKey: 'textModel' | 'visualModel') => {
    if (!data || !draft) return undefined;
    const next = effectiveProvider(providerKey);
    if (next === data.resolved[providerKey].value || draft[modelKey].trim()) return undefined;
    return `With ${PROVIDER_LABEL[next] ?? next}, a blank model uses ${next}_MODEL on the server${next === 'GEMINI' ? ' (or gemini-2.5-flash)' : ''}. Type a model to be sure.`;
  };

  const set = (key: AiModelKey, value: string) => setDraft((d) => (d ? { ...d, [key]: value } : d));

  const save = async () => {
    if (!draft || changed.length === 0) return;
    setSaving(true);
    setError('');
    try {
      const settings = Object.fromEntries(changed.map((k) => [k, draft[k].trim()]));
      const next = await homeworkRequest<AiModelsView>('/api/admin/ai-models', { method: 'PUT', body: JSON.stringify({ settings }) });
      setData(next);
      setDraft(toDraft(next.saved));
      toast({ title: 'AI models saved', description: 'Every server picks this up within about 30 seconds.' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const isModelOfChangedProvider = (key: AiModelKey) =>
    (key === 'textModel' && changed.includes('textProvider')) || (key === 'visualModel' && changed.includes('visualProvider'));

  const field = (key: AiModelKey, label: string, help: ReactNode, kind: 'model' | 'provider' | 'voice', provider?: string, warn?: ReactNode) =>
    data && draft ? (
      <SettingField
        key={key}
        id={key}
        label={label}
        help={help}
        kind={kind}
        value={draft[key]}
        onChange={(v) => set(key, v)}
        resolved={data.resolved[key]}
        dirty={changed.includes(key)}
        error={invalid[key]}
        providers={data.providers}
        list={provider ? lists[provider] : undefined}
        provider={provider}
        warn={changed.includes(key) || isModelOfChangedProvider(key) ? warn : undefined}
      />
    ) : null;

  return (
    <div>
      <AdminPageHeader
        title="AI models"
        description="Pick the model each feature uses. A blank field uses the server’s environment variable, or the built-in default."
      />
      <LoadState loading={view.loading && !data} error={view.error} retry={view.refresh}>
        {data && draft && (
          <div className="space-y-6">
            <p className="text-sm text-muted-foreground">
              {data.updatedAt
                ? <>Last changed {formatDateTime(data.updatedAt)}{data.updatedBy && <> by {data.updatedBy.name || data.updatedBy.email}</>}.</>
                : 'Nothing has been set here yet, so every feature uses the server’s environment variables.'}
            </p>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Writing</CardTitle>
                <CardDescription>Lesson drafts, the lesson co-author, homework, practice sets, the text tutor and lesson activities.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6 md:grid-cols-2">
                {field('textProvider', 'Provider', 'Who runs the text model.', 'provider')}
                {field('textModel', 'Model', `A ${PROVIDER_LABEL[textProvider] ?? textProvider} model id.`, 'model', textProvider, providerChangeWarning('textProvider', 'textModel'))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Visuals and quizzes</CardTitle>
                <CardDescription>Interactive visuals and quizzes in lessons, the tutor, the demo page, sketches and live classes.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6 md:grid-cols-2">
                {field('visualProvider', 'Provider', 'Who runs the visuals model.', 'provider')}
                {field('visualModel', 'Model', `A ${PROVIDER_LABEL[visualProvider] ?? visualProvider} model id that can call tools.`, 'model', visualProvider, providerChangeWarning('visualProvider', 'visualModel'))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Images and uploads</CardTitle>
                <CardDescription>These always run on Google Gemini.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6 md:grid-cols-2">
                {field('imageModel', 'Image model', 'Lesson illustrations and the drawing collaborator.', 'model', 'GEMINI')}
                {field('extractionModel', 'Upload reading model', 'Reads text out of files teachers upload.', 'model', 'GEMINI')}
                {field('embeddingModel', 'Search index model', 'Indexes uploads so lessons can quote them. Must return 1,536-number vectors.', 'model', 'GEMINI',
                  <>Uploads already indexed keep the old model’s vectors, so searching them gets less accurate until they’re uploaded again. Only change this if you mean to.</>)}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Voice</CardTitle>
                <CardDescription>Gemini Live models. The voice tutor covers students, the embedded tutor widget, the study companion and the co-author’s voice mode.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6 md:grid-cols-2">
                {field('liveModel', 'Voice tutor model', 'Used for each new voice session.', 'model', 'GEMINI')}
                {field('liveVoice', 'Voice tutor voice', 'How the tutor sounds.', 'voice')}
                {field('agentModel', 'Live class co-teacher model', 'Read by the co-teacher at the start of each class.', 'model', 'GEMINI')}
                {field('agentVoice', 'Live class co-teacher voice', 'How the co-teacher sounds.', 'voice')}
              </CardContent>
            </Card>
          </div>
        )}
      </LoadState>

      {data && draft && (
        <div className="sticky bottom-0 z-20 -mx-1 mt-6 rounded-lg border bg-background/95 px-4 py-3 shadow-sm backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p role={error ? 'alert' : 'status'} className={cn('text-sm', error ? 'text-destructive' : 'text-muted-foreground')}>
              {error || (changed.length === 0 ? 'No unsaved changes.' : changed.length === 1 ? '1 unsaved change' : `${changed.length} unsaved changes`)}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" disabled={saving || changed.length === 0} onClick={() => { setDraft(toDraft(data.saved)); setError(''); }}>Discard</Button>
              <Button disabled={saving || changed.length === 0 || Object.keys(invalid).length > 0} onClick={save}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />} Save changes
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SettingField({
  id, label, help, kind, value, onChange, resolved, dirty, error, providers, list, provider, warn,
}: {
  id: string;
  label: string;
  help: ReactNode;
  kind: 'model' | 'provider' | 'voice';
  value: string;
  onChange: (value: string) => void;
  resolved: ResolvedSetting;
  dirty: boolean;
  error?: string;
  providers: AiModelsView['providers'];
  list?: { models: string[]; note?: string } | 'loading';
  provider?: string;
  warn?: ReactNode;
}) {
  const inputId = `ai-${id}`;
  const helpId = `${inputId}-help`;
  const models = list && list !== 'loading' ? list.models : [];
  const typed = value.trim();
  const unknownModel = kind === 'model' && typed && models.length > 0 && !models.includes(typed) && !models.includes(typed.replace(/^models\//, ''));
  const fallbackLabel = resolved.fallback ? `Default: ${kind === 'provider' ? PROVIDER_LABEL[resolved.fallback] ?? resolved.fallback : resolved.fallback}` : resolved.fallbackSource === 'agent' ? 'Default: co-teacher server setting' : 'Default';

  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor={inputId}>{label}</Label>
        {dirty ? <Pill tone="warn">Unsaved</Pill> : resolved.source === 'admin' ? <Pill tone="good">Set here</Pill> : null}
      </div>
      {kind === 'model' ? (
        <>
          <Input
            id={inputId}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={resolved.fallback ?? (resolved.fallbackSource === 'agent' ? 'Co-teacher server setting' : 'Not set')}
            list={models.length ? `${inputId}-list` : undefined}
            maxLength={120}
            spellCheck={false}
            autoComplete="off"
            aria-describedby={helpId}
            aria-invalid={!!error}
            className="font-mono text-sm"
          />
          {models.length > 0 && (
            <datalist id={`${inputId}-list`}>
              {models.map((m) => <option key={m} value={m} />)}
            </datalist>
          )}
        </>
      ) : (
        <Select value={value || USE_FALLBACK} onValueChange={(v) => onChange(v === USE_FALLBACK ? '' : v)}>
          <SelectTrigger id={inputId} aria-describedby={helpId}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={USE_FALLBACK}>{fallbackLabel}</SelectItem>
            {kind === 'provider'
              ? providers.map((p) => (
                <SelectItem key={p.id} value={p.id} disabled={!p.ready && p.id !== value}>
                  {p.label}{!p.ready && ` (needs ${p.missing.join(', ')})`}
                </SelectItem>
              ))
              : LIVE_VOICES.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
      <div id={helpId} className="space-y-1 text-xs text-muted-foreground">
        <p>{help}</p>
        <p>
          In use now: <span className="font-mono text-foreground">{(kind === 'provider' && resolved.value ? PROVIDER_LABEL[resolved.value] : null) ?? resolved.value ?? '—'}</span>
          {sourceText(resolved, resolved.value) && <> ({sourceText(resolved, resolved.value)})</>}
        </p>
        {(resolved.source === 'admin' || typed) && <p>Leave blank to use {fallbackText(resolved)}.</p>}
        {list === 'loading' && kind === 'model' && <p>Loading {PROVIDER_LABEL[provider ?? ''] ?? provider} models…</p>}
        {list && list !== 'loading' && list.note && kind === 'model' && <p>{list.note}</p>}
      </div>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      {!error && unknownModel && (
        <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {PROVIDER_LABEL[provider ?? ''] ?? provider} doesn’t list this model. Check the name before saving.
        </p>
      )}
      {warn && (
        <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{warn}</span>
        </p>
      )}
    </div>
  );
}
