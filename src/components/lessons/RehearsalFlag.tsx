'use client';
import { useState } from 'react';
import { Flag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { addRehearsalNote } from '@/lib/lesson-artifacts/rehearsal-notes';

/** "Flag this moment" while rehearsing a lesson as a student. The note waits for the co-author in the Studio. */
export function RehearsalFlag({ lessonId, where, artifactId, onAdded }: { lessonId: string; where: string; artifactId?: string; onAdded?: () => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState<'ok' | 'failed'>();
  const id = `flag-${artifactId ?? where.replace(/\W+/g, '-')}`;
  if (!open) return <div className="flex items-center gap-3 pt-2">
    <Button type="button" size="sm" variant="outline" onClick={() => { setOpen(true); setSaved(undefined); }}><Flag className="mr-2 h-4 w-4" />Flag this moment</Button>
    {saved === 'ok' && <span role="status" className="text-xs text-muted-foreground">Flagged. Send your notes from the co-author in the Studio.</span>}
  </div>;
  return <form className="space-y-2 rounded-xl border bg-background p-3" onSubmit={event => {
    event.preventDefault();
    if (!note.trim()) return;
    const ok = addRehearsalNote(lessonId, { where, artifactId, note });
    setSaved(ok ? 'ok' : 'failed');
    if (ok) { setNote(''); setOpen(false); onAdded?.(); }
  }}>
    <label htmlFor={id} className="block text-sm font-medium">What would trip a student up here? <span className="font-normal text-muted-foreground">({where})</span></label>
    <Textarea id={id} autoFocus rows={2} maxLength={1000} value={note} onChange={event => setNote(event.target.value)} placeholder="e.g. The slider label is unclear, I didn't know what to change." className="resize-none" />
    {saved === 'failed' && <p role="alert" className="text-xs text-destructive">This browser blocked saving the note. Copy it into the co-author chat instead.</p>}
    <div className="flex justify-end gap-2"><Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" size="sm" disabled={!note.trim()}>Save flag</Button></div>
  </form>;
}
