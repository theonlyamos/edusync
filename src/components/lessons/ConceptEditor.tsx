'use client';

import { useMemo, useState } from 'react';

import { Textarea } from '@/components/ui/textarea';
import { conceptSections, joinConceptSections, parseConceptSections } from '@/lib/lesson-artifacts/creative-concept';

const MAX = 4000;

/**
 * Shows a creative concept as one card per material so teachers can read and
 * edit each part. Free-form concepts, or "Edit as text", use a single box.
 */
export function ConceptEditor({ value, disabled, onChange }: { value: string; disabled: boolean; onChange: (value: string) => void }) {
  const sections = useMemo(() => parseConceptSections(value), [value]);
  const [asText, setAsText] = useState(false);

  if (!sections || asText) return <>
    <Textarea id="creative-concept" maxLength={MAX} value={value} disabled={disabled} onChange={event => onChange(event.target.value)} className="min-h-64 bg-background text-sm leading-7"
      placeholder="Ask for a suggestion, or describe your own concept. Include a memorable setting, an opening diagram, an exploration, a different application, and a visual challenge." />
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <span>{value.length}/{MAX} · Editable before generation. Saved on this device until accepted.</span>
      {sections && <button type="button" className="font-medium text-primary hover:underline" onClick={() => setAsText(false)}>Show as cards</button>}
    </div>
  </>;

  const update = (index: number, text: string) => onChange(joinConceptSections(sections.map((section, position) => position === index ? { ...section, text } : section)));
  return <>
    <div className="grid gap-3 md:grid-cols-2">
      {sections.map((section, index) => {
        const hint = conceptSections.find(item => item.label === section.label)?.hint;
        return <label key={section.label} className={index === 0 ? 'rounded-xl border bg-background p-4 md:col-span-2' : 'rounded-xl border bg-background p-4'}>
          <span className="block text-sm font-semibold">{section.label}</span>
          {hint && <span className="block text-xs text-muted-foreground">{hint.charAt(0).toUpperCase() + hint.slice(1)}</span>}
          <Textarea aria-label={section.label} value={section.text} disabled={disabled} onChange={event => update(index, event.target.value)}
            className="mt-2 min-h-24 resize-y border-0 bg-transparent p-0 text-sm leading-6 shadow-none focus-visible:ring-0" />
        </label>;
      })}
    </div>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <span className={value.length > MAX ? 'text-destructive' : undefined}>{value.length}/{MAX} · Editable before generation. Saved on this device until accepted.</span>
      <button type="button" className="font-medium text-primary hover:underline" onClick={() => setAsText(true)}>Edit as text</button>
    </div>
  </>;
}
