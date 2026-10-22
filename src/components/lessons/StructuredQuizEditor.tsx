'use client';

import { useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { structuredQuizPayloadSchema } from '@/lib/lesson-artifacts/domain';
import type { z } from 'zod';

type Quiz = z.infer<typeof structuredQuizPayloadSchema>;
type Question = Quiz['questions'][number];

const label = 'block text-xs font-medium text-muted-foreground';

/**
 * Keeps what the teacher is typing (empty, "-", "2.") until it is a number,
 * so clearing a field or starting a negative value never snaps to 0.
 */
function NumberField({ value, onChange, min, className }: { value: number; onChange: (value: number) => void; min?: number; className?: string }) {
  const [text, setText] = useState(Number.isFinite(value) ? String(value) : '');
  return <Input type="text" inputMode="decimal" className={className} value={text} onChange={event => {
    const next = event.target.value;
    setText(next);
    const parsed = next.trim() === '' ? Number.NaN : Number(next);
    onChange(min !== undefined && parsed < min ? Number.NaN : parsed);
  }} aria-invalid={!Number.isFinite(Number(text)) || text.trim() === ''} />;
}

/** Lists the first few problems in plain words so the teacher knows what to fix. */
function problems(quiz: Quiz) {
  const result = structuredQuizPayloadSchema.safeParse(quiz);
  if (result.success) return [];
  return result.error.issues.slice(0, 3).map((issue) => {
    const question = typeof issue.path[1] === 'number' ? `Question ${issue.path[1] + 1}: ` : '';
    const field = issue.path.includes('options') ? 'options must be filled in and different from each other'
      : issue.path.includes('correctAnswer') ? (typeof issue.path[1] === 'number' && quiz.questions[issue.path[1]]?.type === 'numeric' ? 'enter the correct number' : 'pick a correct answer from the options')
        : issue.path.includes('prompt') ? 'the question is empty'
          : issue.path.includes('explanation') ? 'the explanation is empty'
            : issue.path.includes('tolerance') ? 'the allowed difference must be 0 or more'
              : issue.path[0] === 'title' ? 'the quiz needs a title' : issue.message;
    return `${question}${field}`;
  });
}

function OptionsEditor({ question, onChange }: { question: Extract<Question, { options: string[] }>; onChange: (question: Question) => void }) {
  const multiple = question.type === 'multiple_select';
  const answers = Array.isArray(question.correctAnswer) ? question.correctAnswer : [question.correctAnswer];
  const setOption = (index: number, text: string) => {
    const previous = question.options[index];
    const options = question.options.map((option, position) => position === index ? text : option);
    const rename = (answer: string) => answer === previous ? text : answer;
    onChange(multiple
      ? { ...question, options, correctAnswer: (question.correctAnswer as string[]).map(rename) } as Question
      : { ...question, options, correctAnswer: rename(question.correctAnswer as string) } as Question);
  };
  const toggleCorrect = (option: string) => onChange(multiple
    ? { ...question, correctAnswer: answers.includes(option) ? answers.filter(answer => answer !== option) : [...answers, option] } as Question
    : { ...question, correctAnswer: option } as Question);
  const remove = (index: number) => {
    const option = question.options[index];
    const options = question.options.filter((_, position) => position !== index);
    onChange(multiple
      ? { ...question, options, correctAnswer: answers.filter(answer => answer !== option) } as Question
      : { ...question, options, correctAnswer: question.correctAnswer === option ? '' : question.correctAnswer } as Question);
  };
  return <fieldset className="space-y-2">
    <legend className={label}>Options · {multiple ? 'tick every correct answer' : 'choose the correct answer'}</legend>
    {question.options.map((option, index) => <div key={index} className="flex items-center gap-2">
      <input type={multiple ? 'checkbox' : 'radio'} name={`correct-${question.id}`} aria-label={`Option ${index + 1} is correct`} checked={!!option && answers.includes(option)} onChange={() => toggleCorrect(option)} className="h-4 w-4 accent-[hsl(var(--primary))]" />
      <Input aria-label={`Option ${index + 1}`} value={option} onChange={event => setOption(index, event.target.value)} />
      <Button type="button" variant="ghost" size="icon" aria-label={`Remove option ${index + 1}`} disabled={question.options.length <= 2} onClick={() => remove(index)}><Trash2 className="h-4 w-4" /></Button>
    </div>)}
    <Button type="button" variant="outline" size="sm" disabled={question.options.length >= 8} onClick={() => onChange({ ...question, options: [...question.options, ''] } as Question)}><Plus className="mr-1 h-4 w-4" />Add option</Button>
  </fieldset>;
}

export function StructuredQuizEditor({ quiz, saving, onCancel, onSave }: { quiz: Quiz; saving: boolean; onCancel: () => void; onSave: (quiz: Quiz) => void }) {
  const [draft, setDraft] = useState<Quiz>(() => structuredClone(quiz));
  const issues = problems(draft);
  const update = (index: number, question: Question) => setDraft(current => ({ ...current, questions: current.questions.map((item, position) => position === index ? question : item) }));

  return <div className="mx-auto max-w-3xl space-y-6">
    <label className={label}>Quiz title<Input className="mt-1.5" value={draft.title} onChange={event => setDraft(current => ({ ...current, title: event.target.value }))} /></label>
    {draft.questions.map((question, index) => <section key={question.id} className="space-y-4 rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Question {index + 1} · {question.type.replace('_', ' ')}</p>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">Points<Input type="number" min={1} max={20} className="h-8 w-16" value={question.points} onChange={event => update(index, { ...question, points: Math.max(1, Math.round(Number(event.target.value) || 1)) })} /></label>
      </div>
      <label className={label}>Question<Textarea className="mt-1.5 min-h-16 text-sm text-foreground" value={question.prompt} onChange={event => update(index, { ...question, prompt: event.target.value })} /></label>
      {(question.type === 'multiple_choice' || question.type === 'multiple_select') && <OptionsEditor question={question} onChange={next => update(index, next)} />}
      {question.type === 'true_false' && <fieldset className="flex gap-4 text-sm"><legend className={`${label} mb-2`}>Correct answer</legend>{[true, false].map(value => <label key={String(value)} className="flex items-center gap-2"><input type="radio" name={`correct-${question.id}`} checked={question.correctAnswer === value} onChange={() => update(index, { ...question, correctAnswer: value })} className="h-4 w-4" />{value ? 'True' : 'False'}</label>)}</fieldset>}
      {question.type === 'numeric' && <div className="flex flex-wrap gap-4">
        <label className={label}>Correct answer<NumberField className="mt-1.5 w-36" value={question.correctAnswer} onChange={correctAnswer => update(index, { ...question, correctAnswer })} /></label>
        <label className={label}>Allowed difference (±)<NumberField className="mt-1.5 w-36" min={0} value={question.tolerance} onChange={tolerance => update(index, { ...question, tolerance })} /></label>
      </div>}
      <label className={label}>Explanation shown after answering<Textarea className="mt-1.5 min-h-16 text-sm text-foreground" value={question.explanation} onChange={event => update(index, { ...question, explanation: event.target.value })} /></label>
    </section>)}
    {issues.length > 0 && <ul role="alert" className="list-disc space-y-1 rounded-lg bg-destructive/5 p-3 pl-7 text-sm text-destructive">{issues.map(issue => <li key={issue}>{issue}</li>)}</ul>}
    <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
      <p className="text-xs text-muted-foreground">Saves as a new version for you to approve. No AI, no credits.</p>
      <div className="flex gap-2"><Button variant="ghost" disabled={saving} onClick={onCancel}>Cancel</Button><Button disabled={saving || issues.length > 0} onClick={() => onSave(draft)}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save as new version</Button></div>
    </div>
  </div>;
}
