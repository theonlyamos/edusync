'use client';

import { useEffect, useState } from 'react';
import { ImageIcon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { StudentSafeArtifact } from '@/lib/lesson-artifacts/domain';

async function readJson(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'The lesson introduction could not be loaded');
  return data;
}

export function LessonIntroduction({ lessonId }: { lessonId: string }) {
  return <Introduction key={lessonId} lessonId={lessonId} />;
}

function Introduction({ lessonId }: { lessonId: string }) {
  const [visual, setVisual] = useState<{ url: string; alt: string; caption: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const { artifact }: { artifact: StudentSafeArtifact | null } = await readJson(await fetch(
          `/api/lessons/${lessonId}/introduction`, { cache: 'no-store', signal: controller.signal },
        ));
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
  }, [lessonId, attempt]);

  if (!loading && !error && !visual) return null;
  return (
    <Card className="mb-6 overflow-hidden">
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ImageIcon className="h-4 w-4" />Lesson introduction</CardTitle></CardHeader>
      <CardContent>
        {loading ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading introduction…</p> : error ? (
          <div role="alert" className="space-y-3"><p className="text-sm text-destructive">{error}</p><Button variant="outline" size="sm" onClick={() => { setError(undefined); setVisual(null); setLoading(true); setAttempt((value) => value + 1); }}>Try again</Button></div>
        ) : visual ? (
          <figure>
            {/* Signed private URLs must bypass Next image optimization. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={visual.url} alt={visual.alt} className="max-h-[640px] w-full rounded-xl object-contain" onError={() => setError('The introduction image could not be displayed')} />
            <figcaption className="mt-3 text-sm text-muted-foreground">{visual.caption}</figcaption>
          </figure>
        ) : null}
      </CardContent>
    </Card>
  );
}
