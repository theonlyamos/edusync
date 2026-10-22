'use client';
import { ArrowDown, ArrowRight, ArrowUp, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { DirectionEditImpact } from '@/lib/lesson-artifacts/studio-state';

type DraftObjective = { id?: string; text: string; visualInstructions?: string };
export function StudioDirections({ instructions, objectives, onInstructions, onObjectives, editIndex, onEditIndex, disabled, dirty, impact, saving, onContinue }: {
  instructions: string;
  objectives: DraftObjective[];
  onInstructions: (text: string) => void;
  onObjectives: (items: DraftObjective[]) => void;
  editIndex: number;
  onEditIndex: (index: number) => void;
  disabled: boolean;
  dirty: boolean;
  impact?: DirectionEditImpact;
  saving: boolean;
  onContinue: () => void;
}) {
  const index = Math.max(0, Math.min(editIndex, objectives.length - 1));
  const update = (position: number, value: Partial<DraftObjective>) => onObjectives(objectives.map((item, at) => at === position ? { ...item, ...value } : item));
  const move = (position: number, offset: number) => {
    const copy = [...objectives];
    [copy[position], copy[position + offset]] = [copy[position + offset], copy[position]];
    onObjectives(copy); onEditIndex(position + offset);
  };
  const remove = (position: number) => { onObjectives(objectives.filter((_, at) => at !== position)); onEditIndex(Math.max(0, position - 1)); };
  return <div className="max-w-3xl space-y-7">
    <div className="space-y-3"><label htmlFor="lesson-visual-instructions" className="text-sm font-medium">Creative direction for the lesson <span className="font-normal text-muted-foreground">(optional)</span></label>
      <Textarea id="lesson-visual-instructions" maxLength={4000} value={instructions} disabled={disabled} onChange={event => onInstructions(event.target.value)} placeholder="A setting, visual style, familiar examples, or important labels. Leave room for the AI to suggest creative approaches." className="min-h-28" />
      <p className="text-xs text-muted-foreground">Shared across objectives. Specific objective directions refine these defaults.</p>
    </div>
    <section className="space-y-4 border-t pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><h4 className="font-medium">Learning objectives</h4><Button size="sm" variant="outline" disabled={disabled || objectives.length >= 20} onClick={() => { onEditIndex(objectives.length); onObjectives([...objectives, { text: '', visualInstructions: '' }]); }}><Plus className="mr-1 h-4 w-4" />Add objective</Button></div>
      <ol className="space-y-3">{objectives.map((item, position) => <li key={item.id ?? `new-${position}`} className={`rounded-xl border p-3 sm:p-4 ${position === index ? 'border-primary/40' : ''}`} onFocusCapture={() => onEditIndex(position)}>
        <div className="flex items-start gap-3">
          <span className="mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">{position + 1}</span>
          <Textarea aria-label={`Objective ${position + 1}`} value={item.text} maxLength={500} disabled={disabled} onChange={event => update(position, { text: event.target.value })} placeholder="Students will be able to…" className="min-h-16 flex-1" />
          <div className="flex shrink-0 flex-col gap-1">
            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Move objective ${position + 1} up`} title="Move up" disabled={disabled || position === 0} onClick={() => move(position, -1)}><ArrowUp className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Move objective ${position + 1} down`} title="Move down" disabled={disabled || position === objectives.length - 1} onClick={() => move(position, 1)}><ArrowDown className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" aria-label={`Remove objective ${position + 1}`} title="Remove" disabled={disabled || objectives.length === 1} onClick={() => remove(position)}><Trash2 className="h-4 w-4" /></Button>
          </div>
        </div>
        <details className="ml-9 mt-2"><summary className="cursor-pointer text-xs text-muted-foreground">Visual directions for this objective{item.visualInstructions?.trim() ? ' · added' : ' (optional)'}</summary>
          <Textarea aria-label={`Objective ${position + 1} visual directions`} maxLength={4000} value={item.visualInstructions ?? ''} disabled={disabled} onChange={event => update(position, { visualInstructions: event.target.value })} className="mt-2" placeholder="Any diagrams, examples, labels or interactions this objective needs." />
        </details>
      </li>)}</ol>
    </section>
    <div className="flex flex-wrap items-center justify-between gap-4 border-t pt-5"><p role="status" className={impact?.total ? 'max-w-md text-xs text-amber-700 dark:text-amber-400' : 'text-xs text-muted-foreground'}>{!dirty ? 'Directions saved.' : impact?.total ? `Changes are not saved yet. Saving outdates ${impact.total === 1 ? '1 approved item' : `${impact.total} approved items`}, which will need new versions.` : 'Changes are not saved yet.'}</p><Button disabled={disabled || objectives.some(item => !item.text.trim())} onClick={onContinue}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{dirty ? 'Save & continue' : 'Continue'}<ArrowRight className="ml-2 h-4 w-4" /></Button></div>
  </div>;
}
