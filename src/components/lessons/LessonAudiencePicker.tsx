'use client';

import { useEffect, useState } from 'react';
import { Loader2, Users } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/use-toast';
import { audienceSummary } from '@/lib/lesson-artifacts/studio-state';
import { formatGradeLevel } from '@/lib/lesson-record';

export type LessonAudienceData = {
  schoolName: string | null;
  gradeLevel: string;
  students: number | null;
  classes?: { id: string; name: string; students: number }[];
  classIds?: string[];
};

/** "Who will see it" on the publish step, with a choice of the grade's classes when it has any. */
export function LessonAudiencePicker({ lessonId, audience, onChange, disabled }: {
  lessonId: string;
  audience: LessonAudienceData;
  onChange: (audience: LessonAudienceData) => void;
  disabled?: boolean;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [chosen, setChosen] = useState<string[]>(audience.classIds ?? []);
  useEffect(() => { setChosen(audience.classIds ?? []); }, [audience.classIds]);

  const classes = audience.classes ?? [];
  const grade = formatGradeLevel(audience.gradeLevel);
  const summary = audienceSummary(audience, formatGradeLevel);

  const save = async (classIds: string[]) => {
    const previous = chosen;
    setChosen(classIds);
    setSaving(true);
    try {
      const response = await fetch(`/api/teachers/lessons/${lessonId}/audience`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classIds }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not change who sees it');
      onChange(body.audience);
    } catch (error) {
      setChosen(previous);
      toast({ title: 'Could not change who sees it', description: (error as Error).message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const toggle = (id: string, on: boolean) => save(on ? [...chosen, id] : chosen.filter((c) => c !== id));

  return (
    <div className="flex items-start gap-3 rounded-xl border bg-muted/30 p-4 text-sm">
      <Users className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 font-medium">Who will see it{saving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-label="Saving" />}</p>
        {summary && <p className="text-muted-foreground">{summary}.</p>}
        {classes.length > 0 && (
          <fieldset className="mt-3" disabled={disabled || saving}>
            <legend className="mb-2 text-xs text-muted-foreground">Set it for the whole of {grade}, or only some classes. Changes apply straight away.</legend>
            <div className="flex flex-wrap gap-2">
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border bg-background px-3 py-1.5">
                <Checkbox checked={chosen.length === 0} onCheckedChange={(on) => on === true && save([])} />
                Whole grade
              </label>
              {classes.map((c) => (
                <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-lg border bg-background px-3 py-1.5">
                  <Checkbox checked={chosen.includes(c.id)} onCheckedChange={(on) => toggle(c.id, on === true)} />
                  {c.name.toLowerCase().startsWith(grade.toLowerCase()) ? c.name : `${grade} ${c.name}`}
                  <span className="text-xs text-muted-foreground">({c.students})</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
      </div>
    </div>
  );
}
