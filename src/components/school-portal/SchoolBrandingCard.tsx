'use client';

import { useContext, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Loader2, Upload, Trash2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { LogoMark } from '@/components/brand/Logo';
import { NATIVE_SELECT_CLASS } from '@/components/school-portal/PersonFormDialog';
import { SupabaseSessionContext } from '@/components/providers/SupabaseAuthProvider';
import { updateSchoolBranding, type ClientBranding } from '@/components/school-branding/school-branding-client';
import {
  BRANDING_PRESETS,
  CUSTOM_PRESET_ID,
  DEFAULT_PRESET_ID,
  DEFAULT_TOKEN_VARIABLES,
  LOGO_MAX_BYTES,
  brandingColors,
  brandingTokens,
  tokenVariables,
  type BrandingMode,
} from '@/lib/school-branding';
import { cn } from '@/lib/utils';

type Draft = { preset: string; primary: string; secondary: string; mode: BrandingMode | null };

/** Page colours for each look (globals.css), so the preview is right whatever look the page is in. */
const PREVIEW_BASE: Record<'light' | 'dark', Record<string, string>> = {
  light: {
    '--background': '38 38% 97%', '--foreground': '24 18% 12%', '--card': '36 33% 99%', '--card-foreground': '24 18% 12%',
    '--muted': '30 24% 92%', '--muted-foreground': '24 12% 38%', '--border': '28 18% 86%',
  },
  dark: {
    '--background': '24 20% 9%', '--foreground': '36 33% 94%', '--card': '24 18% 12%', '--card-foreground': '36 33% 94%',
    '--muted': '26 16% 18%', '--muted-foreground': '30 16% 68%', '--border': '26 18% 20%',
  },
};

const HEX_INPUT = /^#[0-9a-f]{6}$/i;

function errorText(body: unknown, fallback: string) {
  return (body as { error?: string } | null)?.error ?? fallback;
}

function toDraft(data: ClientBranding | null): Draft {
  const b = data?.branding;
  const colors = b ? brandingColors(b) : null;
  const fallback = BRANDING_PRESETS[0];
  return {
    preset: b?.preset ?? DEFAULT_PRESET_ID,
    primary: colors?.primary ?? fallback.primary,
    secondary: colors?.secondary ?? fallback.secondary,
    mode: b?.mode ?? null,
  };
}

function sameDraft(a: Draft, b: Draft) {
  if (a.preset !== b.preset || a.mode !== b.mode) return false;
  return a.preset !== CUSTOM_PRESET_ID || (a.primary.toLowerCase() === b.primary.toLowerCase() && a.secondary.toLowerCase() === b.secondary.toLowerCase());
}

function ColorField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  const [text, setText] = useState(value);
  const [shown, setShown] = useState(value);
  // Follow the picker (or a preset switch) without an effect.
  if (shown !== value) {
    setShown(value);
    setText(value);
  }
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} picker`}
          value={HEX_INPUT.test(value) ? value : '#000000'}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-12 shrink-0 cursor-pointer rounded-md border bg-transparent p-1"
        />
        <Input
          id={id}
          value={text}
          maxLength={7}
          spellCheck={false}
          className="font-mono uppercase"
          onChange={(e) => {
            const next = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`;
            setText(next);
            if (HEX_INPUT.test(next)) onChange(next.toLowerCase());
          }}
          onBlur={() => setText(value)}
        />
      </div>
    </div>
  );
}

function Preview({ look, vars, name, logoUrl }: { look: 'light' | 'dark'; vars: Record<string, string>; name: string; logoUrl: string | null }) {
  const style = { ...PREVIEW_BASE[look], ...vars, colorScheme: look } as CSSProperties;
  return (
    <div style={style} className="overflow-hidden rounded-lg border border-border bg-background text-foreground" aria-hidden>
      <div className="flex">
        <div className="w-28 shrink-0 space-y-1 border-r border-border bg-card p-2 text-[11px]">
          <div className="mb-2 flex items-center gap-1.5">
            {logoUrl
              // eslint-disable-next-line @next/next/no-img-element -- school logos live in Supabase storage
              ? <img src={logoUrl} alt="" className="h-5 w-5 rounded object-contain" />
              : <LogoMark className="h-5 w-5" />}
            <span className="truncate font-semibold">{logoUrl ? name : 'InsyteAI'}</span>
          </div>
          <div className="rounded bg-primary/10 px-1.5 py-1 font-medium text-primary">Dashboard</div>
          <div className="px-1.5 py-1 text-muted-foreground">Lessons</div>
          <div className="rounded bg-accent px-1.5 py-1 text-accent-foreground">Homework</div>
        </div>
        <div className="min-w-0 flex-1 space-y-2 p-3 text-xs">
          <p className="font-semibold">{look === 'light' ? 'Light look' : 'Dark look'}</p>
          <p className="text-muted-foreground">
            Next lesson: <span className="font-medium text-primary underline">Fractions</span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            <span className="rounded-md bg-primary px-2 py-1 font-medium text-primary-foreground">Start</span>
            <span className="rounded-md bg-accent px-2 py-1 font-medium text-accent-foreground">New</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full w-2/3 rounded-full bg-primary" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** School settings card: logo, colour theme (preset or custom primary + secondary) and default look. */
export function SchoolBrandingCard({ schoolName }: { schoolName: string }) {
  const { toast } = useToast();
  const session = useContext(SupabaseSessionContext);
  const userId = session?.user?.id ?? null;
  const [loaded, setLoaded] = useState<ClientBranding | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft>(toDraft(null));
  const [busy, setBusy] = useState<'save' | 'logo' | 'remove' | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/schools/branding', { cache: 'no-store' });
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(errorText(body, 'Could not load branding'));
        if (cancelled) return;
        setLoaded(body?.branding ? body : null);
        setDraft(toDraft(body?.branding ? body : null));
      } catch (error) {
        if (!cancelled) toast({ title: 'Branding', description: (error as Error).message, variant: 'destructive' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [toast]);

  /** Takes the saved branding from the server. Logo changes keep any unsaved colour edits. */
  const applied = (body: ClientBranding, keepDraft = false) => {
    setLoaded(body);
    if (!keepDraft) setDraft(toDraft(body));
    if (userId) updateSchoolBranding(userId, body);
  };

  const colors = draft.preset === CUSTOM_PRESET_ID ? { primary: draft.primary, secondary: draft.secondary } : brandingColors({ preset: draft.preset, primary: null, secondary: null });
  const tokens = useMemo(() => (colors ? brandingTokens(colors) : null), [colors?.primary, colors?.secondary]); // eslint-disable-line react-hooks/exhaustive-deps
  const adjusted = tokens ? ['light', 'dark'].some((m) => tokens[m as 'light'].primary.adjusted || tokens[m as 'light'].secondary.adjusted) : false;
  const varsFor = (look: 'light' | 'dark') => (tokens ? tokenVariables(tokens[look]) : DEFAULT_TOKEN_VARIABLES[look]);

  const dirty = !sameDraft(draft, toDraft(loaded));
  const logoUrl = loaded?.branding.logoUrl ?? null;
  const name = loaded?.school.name ?? schoolName;

  const save = async (next: Draft, done: string) => {
    setBusy('save');
    try {
      const res = await fetch('/api/schools/branding', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(errorText(body, 'Please try again.'));
      applied(body);
      toast({ title: done });
    } catch (error) {
      toast({ title: 'Could not save branding', description: (error as Error).message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const upload = async (file: File) => {
    if (file.size > LOGO_MAX_BYTES) {
      toast({ title: 'Logo too large', description: 'Use an image of 512 KB or less.', variant: 'destructive' });
      return;
    }
    setBusy('logo');
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/schools/branding/logo', { method: 'POST', body: form });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(errorText(body, 'Please try again.'));
      applied(body, true);
      toast({ title: 'Logo updated' });
    } catch (error) {
      toast({ title: 'Could not upload the logo', description: (error as Error).message, variant: 'destructive' });
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removeLogo = async () => {
    setBusy('remove');
    try {
      const res = await fetch('/api/schools/branding/logo', { method: 'DELETE' });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(errorText(body, 'Please try again.'));
      applied(body, true);
      toast({ title: 'Logo removed' });
    } catch (error) {
      toast({ title: 'Could not remove the logo', description: (error as Error).message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const options = [...BRANDING_PRESETS, { id: CUSTOM_PRESET_ID, name: 'Custom', primary: draft.primary, secondary: draft.secondary }];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Branding</CardTitle>
        <CardDescription>Your logo, colours and default look. They apply to the school, teacher and student portals.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" aria-label="Loading branding" /></div>
        ) : (
          <>
            <section className="space-y-2" aria-labelledby="branding-logo">
              <h3 id="branding-logo" className="text-sm font-medium">Logo</h3>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-lg border bg-muted/40">
                  {logoUrl
                    // eslint-disable-next-line @next/next/no-img-element -- school logos live in Supabase storage
                    ? <img src={logoUrl} alt={`${name} logo`} className="h-14 w-14 object-contain" />
                    : <LogoMark className="h-10 w-10" title="InsyteAI logo (default)" />}
                </div>
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="sr-only"
                      id="branding-logo-file"
                      onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file); }}
                    />
                    <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={busy !== null}>
                      {busy === 'logo' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                      {logoUrl ? 'Replace logo' : 'Upload logo'}
                    </Button>
                    {logoUrl && (
                      <Button variant="ghost" onClick={removeLogo} disabled={busy !== null}>
                        {busy === 'remove' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                        Remove
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">PNG, JPEG or WebP, up to 512 KB. A square image works best. It also shows in the browser tab.</p>
                </div>
              </div>
            </section>

            <section className="space-y-3" aria-labelledby="branding-colours">
              <h3 id="branding-colours" className="text-sm font-medium">Colours</h3>
              <div role="radiogroup" aria-labelledby="branding-colours" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {options.map((option) => {
                  const selected = draft.preset === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setDraft((d) => ({ ...d, preset: option.id, ...(option.id === CUSTOM_PRESET_ID || d.preset === CUSTOM_PRESET_ID ? {} : { primary: option.primary, secondary: option.secondary }) }))}
                      className={cn(
                        'flex min-h-11 items-center gap-2 rounded-lg border p-2 text-left text-sm transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        selected && 'border-primary ring-1 ring-primary',
                      )}
                    >
                      <span className="flex shrink-0 -space-x-1.5" aria-hidden>
                        <span className="h-5 w-5 rounded-full border border-background" style={{ background: option.primary }} />
                        <span className="h-5 w-5 rounded-full border border-background" style={{ background: option.secondary }} />
                      </span>
                      <span className="min-w-0 flex-1 truncate">{option.name}</span>
                      {selected && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />}
                    </button>
                  );
                })}
              </div>
              {draft.preset === CUSTOM_PRESET_ID && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <ColorField id="branding-primary" label="Primary colour" value={draft.primary} onChange={(primary) => setDraft((d) => ({ ...d, primary }))} />
                  <ColorField id="branding-secondary" label="Secondary colour" value={draft.secondary} onChange={(secondary) => setDraft((d) => ({ ...d, secondary }))} />
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Primary is used for buttons, links and the selected page. Secondary is used for highlights and badges.
                {adjusted && ' We’ve shifted the shade slightly in light or dark mode so text stays easy to read.'}
              </p>
            </section>

            <section className="space-y-1.5">
              <Label htmlFor="branding-mode">Default look</Label>
              <select
                id="branding-mode"
                className={cn(NATIVE_SELECT_CLASS, 'max-w-xs')}
                value={draft.mode ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, mode: (e.target.value || null) as BrandingMode | null }))}
              >
                <option value="">InsyteAI default (dark)</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="system">Match each device</option>
              </select>
              <p className="text-xs text-muted-foreground">Used until someone picks Light, Dark or System from their own profile menu.</p>
            </section>

            <section className="space-y-2" aria-label="Preview">
              <h3 className="text-sm font-medium">Preview</h3>
              <div className="grid gap-3 md:grid-cols-2">
                <Preview look="light" vars={varsFor('light')} name={name} logoUrl={logoUrl} />
                <Preview look="dark" vars={varsFor('dark')} name={name} logoUrl={logoUrl} />
              </div>
            </section>

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => save(draft, 'Branding saved')} disabled={busy !== null || !dirty}>
                {busy === 'save' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save branding
              </Button>
              {dirty && (
                <Button variant="ghost" onClick={() => setDraft(toDraft(loaded))} disabled={busy !== null}>Discard changes</Button>
              )}
              {!dirty && ((loaded?.branding.preset ?? DEFAULT_PRESET_ID) !== DEFAULT_PRESET_ID || loaded?.branding.mode) ? (
                <Button
                  variant="outline"
                  onClick={() => save({ preset: DEFAULT_PRESET_ID, primary: draft.primary, secondary: draft.secondary, mode: null }, 'Back to the InsyteAI colours')}
                  disabled={busy !== null}
                >
                  Reset colours and look
                </Button>
              ) : null}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
