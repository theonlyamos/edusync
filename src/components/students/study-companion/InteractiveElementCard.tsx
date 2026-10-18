'use client';

import dynamic from 'next/dynamic';
import { useRef, useState } from 'react';
import { ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { VisualizationSkeleton } from '@/components/lessons/VisualizationSkeleton';
import { readVisualizationPanelDimensions } from '@/lib/visualization-viewport';
import { reportElementRender } from '@/lib/visual-status';
import { LearningActivityExpandSlot, LearningActivityToolbar } from '@/components/lessons/LearningActivityView';
import type { VisualizationDimensions } from '@/lib/visualization-layout';
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
  onReady,
}: {
  element: InteractiveElement;
  /** Generates a replacement (grade/lesson-grounded) and persists it; resolves with the new viz. */
  onRegenerate?: (element: InteractiveElement, panelDimensions?: VisualizationDimensions) => Promise<InteractiveElementUpdate>;
  onReady?: () => void;
}) {
  const { toast } = useToast();
  const panelRef = useRef<HTMLDivElement>(null);
  const [code, setCode] = useState(element.code);
  const [library, setLibrary] = useState<InteractiveLibrary>(element.library);
  const [explanation, setExplanation] = useState(element.explanation);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [renderKey, setRenderKey] = useState(0);
  const [showExplanation, setShowExplanation] = useState(true);
  const [isRegenerating, setIsRegenerating] = useState(false);

  const handleReady = () => {
    onReady?.();
    reportElementRender(element.id, { ok: true });
  };
  const handleRenderError = (message: string) => {
    setRenderError(message);
    reportElementRender(element.id, { ok: false, reason: message });
  };

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
      const updated = await onRegenerate(element, readVisualizationPanelDimensions(panelRef.current));
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
    <LearningActivityToolbar buttonClassName="h-11 w-11 text-muted-foreground xl:h-7 xl:w-7">
    <Card className="mt-4 overflow-hidden border-muted">
      <CardHeader className="p-3 pb-2 sm:p-6 sm:pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle className="text-sm font-medium">Interactive visualization</CardTitle>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {explanation ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-11 w-11 text-muted-foreground xl:h-7 xl:w-7"
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
                className="h-11 w-11 text-muted-foreground xl:h-7 xl:w-7"
                aria-label={isRegenerating ? 'Regenerating visualization' : 'Regenerate visualization'}
                aria-busy={isRegenerating}
                title="Regenerate visualization"
                disabled={isRegenerating}
                onClick={regenerate}
              >
                <RefreshCw className={`h-4 w-4 ${isRegenerating ? 'animate-spin' : ''}`} />
              </Button>
            ) : null}
            <LearningActivityExpandSlot />
          </div>
        </div>
        {explanation && showExplanation ? (
          <CardDescription className="text-xs leading-relaxed">{explanation}</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
        {/* A definite adaptive height gives the sandbox its actual drawable viewport. */}
        <div
          ref={panelRef}
          data-visualization-panel
          className="relative w-full overflow-hidden rounded-md border bg-background"
          style={{ height: 'clamp(240px, 65dvh, 720px)' }}
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
            <ReactRenderer key={renderKey} code={code} onReady={handleReady} onError={handleRenderError} />
          ) : (
            <SafeCodeRunner
              key={renderKey}
              code={code}
              library={library}
              onReady={handleReady}
              onError={handleRenderError}
            />
          )}
        </div>
      </CardContent>
    </Card>
    </LearningActivityToolbar>
  );
}
