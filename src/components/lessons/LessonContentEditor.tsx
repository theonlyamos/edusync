'use client';

import { useState } from 'react';
import { Loader2, Pencil } from 'lucide-react';

import { MarkdownContent } from '@/components/content/MarkdownContent';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

const MAX_LENGTH = 100_000;

/** Lesson text that teachers can read, write in Markdown, and preview with math. */
export function LessonContentEditor({ lessonId, content, live, onSaved }: { lessonId: string; content: string | null; live: boolean; onSaved: (content: string | null) => void }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState<'write' | 'preview'>('write');
  const [draft, setDraft] = useState(content ?? '');
  const [saving, setSaving] = useState(false);

  const start = () => { setDraft(content ?? ''); setMode('write'); setEditing(true); };
  const save = async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/teachers/lessons/${lessonId}/content`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: draft }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'The lesson text could not be saved.');
      onSaved(result.content ?? null);
      setEditing(false);
      toast({ title: 'Lesson text saved', description: live ? 'Publish again from the Objective Studio to show it to students. Approved materials are unchanged.' : 'Approved materials are unchanged.' });
    } catch (error) {
      toast({ title: 'Could not save lesson text', description: (error as Error).message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="mb-6">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="space-y-1.5">
          <CardTitle>Lesson text</CardTitle>
          <CardDescription>What students read on the lesson overview. Supports Markdown and math such as $x^2$ or $$E = mc^2$$.</CardDescription>
        </div>
        {!editing && <Button variant="outline" size="sm" onClick={start}><Pencil className="mr-2 h-4 w-4" />{content ? 'Edit' : 'Add lesson text'}</Button>}
      </CardHeader>
      <CardContent>
        {editing ? (
          <div className="space-y-3">
            <div role="tablist" aria-label="Lesson text editor" className="inline-flex rounded-lg border bg-muted/40 p-1 text-sm">
              {(['write', 'preview'] as const).map(option => (
                <button key={option} role="tab" aria-selected={mode === option} onClick={() => setMode(option)}
                  className={cn('rounded-md px-3 py-1 font-medium capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', mode === option ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                  {option}
                </button>
              ))}
            </div>
            {mode === 'write'
              ? <Textarea aria-label="Lesson text" value={draft} maxLength={MAX_LENGTH} onChange={event => setDraft(event.target.value)} className="min-h-80 font-mono text-sm leading-6" placeholder="## Introduction&#10;&#10;Write the lesson for your students…" />
              : <div className="min-h-80 rounded-md border p-4">{draft.trim() ? <MarkdownContent>{draft}</MarkdownContent> : <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>}</div>}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">Saving does not change approved visuals or quizzes.{live ? ' Students see the new text after you publish again.' : ''}</p>
              <div className="flex gap-2">
                <Button variant="ghost" disabled={saving} onClick={() => setEditing(false)}>Cancel</Button>
                <Button disabled={saving || draft === (content ?? '')} onClick={() => void save()}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save text</Button>
              </div>
            </div>
          </div>
        ) : content ? <MarkdownContent>{content}</MarkdownContent> : <p className="text-sm text-muted-foreground">No lesson text yet. Students will see the objectives and materials only.</p>}
      </CardContent>
    </Card>
  );
}
