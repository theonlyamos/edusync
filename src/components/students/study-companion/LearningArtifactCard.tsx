'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ImageIcon, Loader2, ShieldCheck, Sparkles } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

import { InteractiveElementCard } from './InteractiveElementCard';
import type { LearningArtifactAttachment } from './types';

async function json(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function PrivateAsset({
  assetId,
  alt,
  mimeType,
  filename,
  onConsumed,
}: {
  assetId: string;
  alt: string;
  mimeType?: string;
  filename?: string;
  onConsumed: () => void;
}) {
  const [url, setUrl] = useState<string>();
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    fetch(`/api/lesson-assets/${assetId}`)
      .then(json)
      .then((data) => active && setUrl(data.url))
      .catch((assetError) => active && setError(assetError instanceof Error ? assetError.message : 'Could not load this resource'));
    return () => { active = false; };
  }, [assetId, attempt]);
  if (error) {
    return <div className="flex min-h-36 flex-col items-center justify-center rounded-lg border border-destructive/30 bg-destructive/5 p-5 text-center"><p className="text-sm text-destructive">{error}</p><Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => { setUrl(undefined); setError(undefined); setAttempt((value) => value + 1); }}>Try again</Button></div>;
  }
  if (url && mimeType && !mimeType.startsWith('image/')) {
    return <a href={url} target="_blank" rel="noreferrer" onClick={onConsumed} className="flex min-h-36 flex-col items-center justify-center rounded-lg border bg-muted/40 p-5 text-center"><span className="text-sm font-medium">{filename || alt}</span><span className="mt-1 text-xs text-muted-foreground">Open lesson resource</span></a>;
  }
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={alt} onLoad={onConsumed} onError={() => setError('The resource could not be displayed')} className="aspect-[4/3] w-full rounded-lg object-cover" />
  ) : <div className="flex aspect-[4/3] items-center justify-center rounded-lg bg-muted"><Loader2 className="h-5 w-5 animate-spin" /></div>;
}

export function LearningArtifactCard({ attachment }: { attachment: LearningArtifactAttachment }) {
  const { artifact, instanceId } = attachment;
  const payload = artifact.payload;
  const [answers, setAnswers] = useState<Record<string, string | string[] | boolean | number>>({});
  const [result, setResult] = useState<any>();
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [retryAttachment, setRetryAttachment] = useState<LearningArtifactAttachment>();
  const renderedRef = useRef(false);
  const isStructured = artifact.kind === 'structured_quiz';
  const isVisualQuiz = artifact.kind === 'visual_quiz';

  useEffect(() => { renderedRef.current = false; }, [instanceId]);

  const recordRendered = useCallback(() => {
    if (renderedRef.current || isStructured || isVisualQuiz) return;
    renderedRef.current = true;
    fetch(`/api/learning-artifact-instances/${instanceId}/rendered`, { method: 'POST' })
      .then((response) => {
        if (!response.ok) renderedRef.current = false;
      })
      .catch(() => { renderedRef.current = false; });
  }, [instanceId, isStructured, isVisualQuiz]);

  const sourceLabel = attachment.source === 'teacher_approved' ? 'Teacher reviewed' : 'Generated for this session';
  const interactiveElement = useMemo(() => artifact.kind === 'interactive_visualization' || artifact.kind === 'visual_quiz' ? {
    id: instanceId,
    type: 'visualization' as const,
    library: payload.library,
    code: payload.code,
    explanation: payload.explanation,
    taskDescription: payload.taskDescription,
    status: 'ready' as const,
  } : null, [artifact.kind, instanceId, payload]);

  const submitQuiz = async () => {
    setSubmitting(true);
    try {
      const data = await json(await fetch(`/api/learning-artifact-instances/${instanceId}/attempts`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers }),
      }));
      setResult(data);
    } finally { setSubmitting(false); }
  };

  const completeVisual = async () => {
    setSubmitting(true);
    try {
      await json(await fetch(`/api/learning-artifact-instances/${instanceId}/attempts`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed: true }),
      }));
      setCompleted(true);
    } finally { setSubmitting(false); }
  };

  const retryQuiz = async () => {
    setSubmitting(true);
    try {
      setRetryAttachment(await json(await fetch(`/api/learning-artifact-instances/${instanceId}/retry`, { method: 'POST' })));
    } finally { setSubmitting(false); }
  };

  if (retryAttachment) return <LearningArtifactCard attachment={retryAttachment} />;

  return (
    <Card className="mt-4 overflow-hidden border-slate-200 bg-background shadow-sm">
      <CardHeader className="border-b bg-slate-50/70 pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-sm">
              {artifact.kind === 'generated_image' ? <ImageIcon className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
              {isStructured ? payload.title : isVisualQuiz ? 'Visual challenge' : artifact.kind === 'generated_image' ? 'Lesson illustration' : 'Interactive visualization'}
            </CardTitle>
            <CardDescription className="mt-1 text-xs">Aligned to your current objective</CardDescription>
          </div>
          <Badge variant={attachment.source === 'teacher_approved' ? 'success' : 'secondary'} className="gap-1"><ShieldCheck className="h-3 w-3" />{sourceLabel}</Badge>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {interactiveElement && <InteractiveElementCard element={interactiveElement} onReady={artifact.kind === 'interactive_visualization' ? recordRendered : undefined} />}
        {artifact.kind === 'generated_image' && <PrivateAsset assetId={payload.assetId} alt={payload.altText} onConsumed={recordRendered} />}
        {artifact.kind === 'uploaded_media' && <PrivateAsset assetId={payload.assetId} alt={payload.title} mimeType={payload.mimeType} filename={payload.originalFilename} onConsumed={recordRendered} />}
        {isStructured && (
          <div className="space-y-4">
            {payload.questions.map((question: any, index: number) => {
              const questionResult = result?.results?.find((item: any) => item.questionId === question.id);
              return (
                <div key={question.id} className={cn('rounded-xl border p-4', questionResult?.correct === true && 'border-emerald-200 bg-emerald-50', questionResult?.correct === false && 'border-rose-200 bg-rose-50')}>
                  <p className="text-sm font-medium"><span className="mr-2 text-muted-foreground">{index + 1}.</span>{question.prompt}</p>
                  {question.options ? (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {question.options.map((option: string) => {
                        const multiple = question.type === 'multiple_select';
                        const selected = multiple ? (answers[question.id] as string[] | undefined)?.includes(option) : answers[question.id] === option;
                        return <Button key={option} type="button" size="sm" variant={selected ? 'default' : 'outline'} className="h-auto justify-start whitespace-normal py-2 text-left" disabled={!!result} onClick={() => setAnswers((current) => ({ ...current, [question.id]: multiple ? selected ? (current[question.id] as string[]).filter((item) => item !== option) : [...((current[question.id] as string[]) ?? []), option] : option }))}>{option}</Button>;
                      })}
                    </div>
                  ) : question.type === 'true_false' ? (
                    <div className="mt-3 flex gap-2">{[true, false].map((value) => <Button key={String(value)} type="button" size="sm" variant={answers[question.id] === value ? 'default' : 'outline'} disabled={!!result} onClick={() => setAnswers((current) => ({ ...current, [question.id]: value }))}>{value ? 'True' : 'False'}</Button>)}</div>
                  ) : (
                    <Input className="mt-3" type="number" disabled={!!result} value={(answers[question.id] as number | undefined) ?? ''} onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: Number(event.target.value) }))} />
                  )}
                  {questionResult && <p className={cn('mt-3 text-xs', questionResult.correct ? 'text-emerald-800' : 'text-rose-800')}>{questionResult.explanation}</p>}
                </div>
              );
            })}
            {result ? (
              <div className="space-y-3"><div className="flex items-center justify-between rounded-xl bg-slate-950 p-4 text-white"><span className="text-sm">Knowledge check complete</span><span className="text-2xl font-semibold">{result.percentage}%</span></div>{result.percentage < 80 && <Button variant="outline" onClick={retryQuiz} disabled={submitting}>Try this approved quiz again</Button>}</div>
            ) : <Button onClick={submitQuiz} disabled={submitting || Object.keys(answers).length < payload.questions.length}>{submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Check my answers</Button>}
          </div>
        )}
        {isVisualQuiz && <div className="mt-3 flex justify-end"><Button size="sm" onClick={completeVisual} disabled={submitting || completed}>{completed ? <CheckCircle2 className="mr-2 h-4 w-4" /> : null}{completed ? 'Challenge completed' : 'I completed the challenge'}</Button></div>}
      </CardContent>
    </Card>
  );
}
