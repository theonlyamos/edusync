'use client';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { Check, Loader2, Pencil, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { SKETCH_ROLE_LABELS, type SketchResult, type SketchRole } from '@/lib/lesson-artifacts/sketch';

const ReactRenderer = dynamic(() => import('./ReactRenderer').then(module => module.ReactRenderer), { ssr: false });
const SafeCodeRunner = dynamic(() => import('./SafeCodeRunner').then(module => module.SafeCodeRunner), { ssr: false });

function SketchView({ sketch, onError }: { sketch: SketchResult; onError?: (message: string) => void }) {
  return sketch.library === 'react'
    ? <ReactRenderer code={sketch.code} onError={error => onError?.(String(error))} />
    : <SafeCodeRunner code={sketch.code} library={sketch.library} onError={error => onError?.(String(error))} />;
}

/**
 * A live sketch in the co-author chat: draw it, redraw it from an edited
 * description, look at it full size, or keep it as one of the objective's materials.
 */
export function CoauthorSketch({ lessonId, objectiveId, objectiveLabel, role, description, sketch, kept, keepBlocked, onSketch, onKeep }: {
  lessonId: string;
  objectiveId: string;
  objectiveLabel: string;
  role: SketchRole;
  description: string;
  sketch?: SketchResult;
  kept?: boolean;
  /** Why keeping is not possible right now, if it isn't. */
  keepBlocked?: string;
  onSketch: (sketch: SketchResult, description: string) => void;
  onKeep: (sketch: SketchResult) => Promise<boolean>;
}) {
  const [text, setText] = useState(sketch?.taskDescription ?? description);
  const [editing, setEditing] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [keeping, setKeeping] = useState(false);
  const [error, setError] = useState<string>();
  const [renderError, setRenderError] = useState<string>();
  const label = SKETCH_ROLE_LABELS[role];

  const draw = async () => {
    setDrawing(true); setError(undefined); setRenderError(undefined);
    try {
      const response = await fetch(`/api/teachers/lessons/${lessonId}/sketch`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objectiveId, role, taskDescription: text.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'The sketch could not be drawn.');
      onSketch(data as SketchResult, text.trim());
      setEditing(false);
    } catch (drawError) {
      setError(drawError instanceof Error ? drawError.message : 'The sketch could not be drawn.');
    } finally { setDrawing(false); }
  };

  const keep = async () => {
    if (!sketch) return;
    setKeeping(true);
    try { await onKeep(sketch); } finally { setKeeping(false); }
  };

  const changed = !sketch || text.trim() !== sketch.taskDescription;
  const canDraw = text.trim().length >= 10 && !drawing;
  return <div className="space-y-2">
    {sketch && <div className="h-56 overflow-hidden rounded-lg border bg-white">
      <SketchView key={sketch.signature} sketch={sketch} onError={setRenderError} />
    </div>}
    {renderError && <p role="alert" className="text-xs text-destructive">This sketch has an error. Redraw it, maybe with a simpler description.</p>}
    {(editing || !sketch)
      ? <><label className="sr-only" htmlFor={`sketch-${objectiveId}-${role}`}>Describe the sketch</label><Textarea id={`sketch-${objectiveId}-${role}`} rows={4} maxLength={4000} value={text} onChange={event => setText(event.target.value)} className="resize-y bg-background text-xs" /></>
      : <p className="whitespace-pre-wrap rounded-lg bg-muted/50 px-3 py-2 text-xs leading-relaxed text-muted-foreground">{sketch.taskDescription}</p>}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    <p className="text-xs text-muted-foreground">{kept ? `Kept as the ${label} draft for ${objectiveLabel}. Review and approve it in the Studio.` : `Draft only. Each drawing uses 1 visual from your school's AI allowance.${sketch && keepBlocked ? ` ${keepBlocked}` : ''}`}</p>
    <div className="flex flex-wrap gap-2">
      {(!sketch || editing) && <Button type="button" size="sm" className="flex-1" disabled={!canDraw || (!!sketch && !changed)} onClick={() => void draw()}>{drawing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : sketch ? <RefreshCw className="mr-2 h-4 w-4" /> : null}{drawing ? 'Drawing…' : sketch ? 'Redraw' : 'Draw sketch'}</Button>}
      {sketch && !editing && !kept && <Button type="button" size="sm" className="flex-1" disabled={!!keepBlocked || keeping || !!renderError} onClick={() => void keep()}>{keeping ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}Keep as {label}</Button>}
      {sketch && !editing && <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}><Pencil className="mr-2 h-4 w-4" />Change</Button>}
      {sketch && editing && <Button type="button" size="sm" variant="outline" onClick={() => { setText(sketch.taskDescription); setEditing(false); }}>Cancel</Button>}
    </div>
  </div>;
}
