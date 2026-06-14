'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { VisualizationSkeleton } from '@/components/lessons/VisualizationSkeleton';
import { STUDY_COMPANION_VIZ_PANEL } from '@/lib/request-visualization';
import type { InteractiveElement, InteractiveElementUpdate, InteractiveLibrary } from './types';

const ReactRenderer = dynamic(() => import('@/components/lessons/ReactRenderer').then((m) => m.ReactRenderer), {
  ssr: false,
});

const SafeCodeRunner = dynamic(() => import('@/components/lessons/SafeCodeRunner').then((m) => m.SafeCodeRunner), {
  ssr: false,
});

export function InteractiveElementCard({
  element,
  onRegenerate,
}: {
  element: InteractiveElement;
  /** Generates a replacement (grade/lesson-grounded) and persists it; resolves with the new viz. */
  onRegenerate?: (element: InteractiveElement) => Promise<InteractiveElementUpdate>;
}) {
  const { toast } = useToast();
  const [code, setCode] = useState(element.code);
  const [library, setLibrary] = useState<InteractiveLibrary>(element.library);
  const [explanation, setExplanation] = useState(element.explanation);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [renderKey, setRenderKey] = useState(0);
  const [showExplanation, setShowExplanation] = useState(true);
  const [isRegenerating, setIsRegenerating] = useState(false);

  const retryRender = () => {
    setRenderError(null);
    setRenderKey((current) => current + 1);
  };

  // The shell owns regeneration (it has the grade/lesson context and persists the result); the card
  // just drives the in-flight UI and swaps in the returned visualization.
  const regenerate = async () => {
    if (isRegenerating || !onRegenerate) return;
    setIsRegenerating(true);
    try {
      const updated = await onRegenerate(element);
      setCode(updated.code);
      setLibrary(updated.library);
      setExplanation(updated.explanation);
      setRenderError(null);
      setRenderKey((current) => current + 1);
    } catch (error) {
      toast({
        title: 'Could not regenerate visualization',
        description: error instanceof Error ? error.message : 'Please try again in a moment.',
        variant: 'destructive',
      });
    } finally {
      setIsRegenerating(false);
    }
  };

  return (
    <Card className="mt-4 overflow-hidden border-muted">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm font-medium">Interactive visualization</CardTitle>
          <div className="flex shrink-0 items-center gap-1">
            {explanation ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground"
                aria-expanded={showExplanation}
                aria-label={showExplanation ? 'Hide explanation' : 'Show explanation'}
                title={showExplanation ? 'Hide explanation' : 'Show explanation'}
                onClick={() => setShowExplanation((current) => !current)}
              >
                {showExplanation ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            ) : null}
            {onRegenerate ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground"
                aria-label={isRegenerating ? 'Regenerating visualization' : 'Regenerate visualization'}
                aria-busy={isRegenerating}
                title="Regenerate visualization"
                disabled={isRegenerating}
                onClick={regenerate}
              >
                <RefreshCw className={`h-4 w-4 ${isRegenerating ? 'animate-spin' : ''}`} />
              </Button>
            ) : null}
          </div>
        </div>
        {explanation && showExplanation ? (
          <CardDescription className="text-xs leading-relaxed">{explanation}</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="pt-0">
        {/* Concrete height (single source of truth: the generation panel height) so the child
            `h-full` renderer + iframe resolve to a real height instead of collapsing to the
            iframe's intrinsic 150px default. */}
        <div
          className="relative w-full overflow-hidden rounded-md border bg-background"
          style={{ height: STUDY_COMPANION_VIZ_PANEL.height }}
        >
          {isRegenerating ? (
            <VisualizationSkeleton />
          ) : renderError ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center text-sm">
              <p className="max-w-md text-destructive">{renderError}</p>
              <Button type="button" variant="outline" size="sm" onClick={retryRender}>
                Try again
              </Button>
            </div>
          ) : library === 'react' ? (
            <ReactRenderer key={renderKey} code={code} onError={(msg) => setRenderError(msg)} />
          ) : (
            <SafeCodeRunner
              key={renderKey}
              code={code}
              library={library}
              onError={(msg) => setRenderError(msg)}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
