'use client';
import { ArrowDown, ArrowRight, ArrowUp, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

type DraftObjective = { id?: string; text: string; visualInstructions?: string };
export function StudioDirections({ instructions, objectives, onInstructions, onObjectives, editIndex, onEditIndex, disabled, dirty, saving, onContinue }: {
  instructions: string;
  objectives: DraftObjective[];
  onInstructions: (text: string) => void;
  onObjectives: (items: DraftObjective[]) => void;
  editIndex: number;
  onEditIndex: (index: number) => void;
  disabled: boolean;
  dirty: boolean;
  saving: boolean;
  onContinue: () => void;
}) {
  const index = Math.max(0, Math.min(editIndex, objectives.length - 1));
  const editing = objectives[index];
  const update = (value: Partial<DraftObjective>) => onObjectives(objectives.map((item, position) => position === index ? { ...item, ...value } : item));
  const move = (offset: number) => {
    const copy = [...objectives];
    [copy[index], copy[index + offset]] = [copy[index + offset], copy[index]];
    onObjectives(copy); onEditIndex(index + offset);
  };
  return <div className="max-w-3xl space-y-7">
    <div className="space-y-3"><label htmlFor="lesson-visual-instructions" className="text-sm font-medium">Creative direction for the lesson <span className="font-normal text-muted-foreground">(optional)</span></label>
      <Textarea id="lesson-visual-instructions" maxLength={4000} value={instructions} disabled={disabled} onChange={event => onInstructions(event.target.value)} placeholder="A setting, visual style, familiar examples, or important labels. Leave room for the AI to suggest creative approaches." className="min-h-28" />
      <p className="text-xs text-muted-foreground">Shared across objectives. Specific objective directions refine these defaults.</p>
    </div>
    <section className="space-y-4 border-t pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><h4 className="font-medium">Learning objectives</h4><Button size="sm" variant="outline" disabled={disabled || objectives.length >= 20} onClick={() => { onEditIndex(objectives.length); onObjectives([...objectives, { text: '', visualInstructions: '' }]); }}><Plus className="mr-1 h-4 w-4" />Add objective</Button></div>
      <label className="block text-xs text-muted-foreground">Edit objective<select aria-label="Edit objective" className="mt-2 w-full min-w-0 rounded-lg border bg-background p-3 text-sm text-foreground" value={index} onChange={event => onEditIndex(Number(event.target.value))}>{objectives.map((item, position) => <option key={item.id ?? position} value={position}>{position + 1}. {item.text || 'New objective'}</option>)}</select></label>
      {editing && <div className="space-y-4"><label className="block text-sm font-medium">What should students learn?<Textarea aria-label={`Objective ${index + 1}`} value={editing.text} maxLength={500} disabled={disabled} onChange={event => update({ text: event.target.value })} className="mt-2 min-h-20" /></label>
        <details><summary className="cursor-pointer text-sm text-muted-foreground">Specific visual directions & objective order</summary><div className="mt-4 space-y-3">
          <label className="block text-sm">Objective visual directions<Textarea aria-label="Objective visual directions" maxLength={4000} value={editing.visualInstructions ?? ''} disabled={disabled} onChange={event => update({ visualInstructions: event.target.value })} className="mt-2" placeholder="Any diagrams, examples, labels or interactions this objective needs." /></label>
          <div className="flex gap-2"><Button size="sm" variant="outline" aria-label="Move objective up" disabled={disabled || index === 0} onClick={() => move(-1)}><ArrowUp className="h-4 w-4" /></Button><Button size="sm" variant="outline" aria-label="Move objective down" disabled={disabled || index === objectives.length - 1} onClick={() => move(1)}><ArrowDown className="h-4 w-4" /></Button><Button size="sm" variant="ghost" disabled={disabled || objectives.length === 1} onClick={() => { onObjectives(objectives.filter((_, position) => position !== index)); onEditIndex(Math.max(0, index - 1)); }}><Trash2 className="mr-2 h-4 w-4" />Remove</Button></div>
        </div></details>
      </div>}
    </section>
    <div className="flex flex-wrap items-center justify-between gap-4 border-t pt-5"><p className="text-xs text-muted-foreground">{dirty ? 'Changes are not saved yet.' : 'Directions saved.'}</p><Button disabled={disabled || objectives.some(item => !item.text.trim())} onClick={onContinue}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{dirty ? 'Save & continue' : 'Continue'}<ArrowRight className="ml-2 h-4 w-4" /></Button></div>
  </div>;
}
