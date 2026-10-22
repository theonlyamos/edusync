'use client';

import { useEffect, useState } from 'react';
import { ImageIcon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { StudentSafeArtifact } from '@/lib/lesson-artifacts/domain';
import { LearningImage } from './LearningImage';

async function readJson(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'The lesson introduction could not be loaded');
  return data;
}

/**
 * Pass `artifact` (null for none) to show a known introduction, such as the
 * one in a student preview manifest, instead of loading the latest approved one.
 */
export function LessonIntroduction({ lessonId, artifact }: { lessonId: string; artifact?: StudentSafeArtifact | null }) {
  return <Introduction key={`${lessonId}:${artifact === undefined ? 'latest' : artifact?.id ?? 'none'}`} lessonId={lessonId} artifact={artifact} />;
}

function Introduction({ lessonId, artifact: given }: { lessonId: string; artifact?: StudentSafeArtifact | null }) {
  const [visual, setVisual] = useState<{ url: string; alt: string; caption: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const artifact: StudentSafeArtifact | null = given !== undefined ? given : (await readJson(await fetch(
          `/api/lessons/${lessonId}/introduction`, { cache: 'no-store', signal: controller.signal },
        ))).artifact;
        if (!artifact) return;
        if (artifact.payload.kind !== 'generated_image') throw new Error('The lesson introduction is unavailable');
        const asset = await readJson(await fetch(`/api/lesson-assets/${artifact.payload.assetId}`, { signal: controller.signal }));
        if (!controller.signal.aborted) setVisual({ url: asset.url, alt: artifact.payload.altText, caption: artifact.payload.caption });
      } catch (requestError) {
        if (!controller.signal.aborted) setError(requestError instanceof Error ? requestError.message : 'The lesson introduction could not be loaded');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [lessonId, given, attempt]);

  if (!loading && !error && !visual) return null;
  return (
    <Card className="mb-6 overflow-hidden">
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ImageIcon className="h-4 w-4" />Lesson introduction</CardTitle></CardHeader>
      <CardContent>
        {loading ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading introduction…</p> : error ? (
          <div role="alert" className="space-y-3"><p className="text-sm text-destructive">{error}</p><Button variant="outline" size="sm" onClick={() => { setError(undefined); setVisual(null); setLoading(true); setAttempt((value) => value + 1); }}>Try again</Button></div>
        ) : visual ? (
          <LearningImage key={visual.url} src={visual.url} alt={visual.alt} caption={visual.caption} onError={() => setError('The introduction image could not be displayed')} />
        ) : null}
      </CardContent>
    </Card>
  );
}
