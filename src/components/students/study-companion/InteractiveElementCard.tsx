'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { InteractiveElement } from './types';

const ReactRenderer = dynamic(() => import('@/components/lessons/ReactRenderer').then((m) => m.ReactRenderer), {
  ssr: false,
});

const SafeCodeRunner = dynamic(() => import('@/components/lessons/SafeCodeRunner').then((m) => m.SafeCodeRunner), {
  ssr: false,
});

export function InteractiveElementCard({ element }: { element: InteractiveElement }) {
  const [renderError, setRenderError] = useState<string | null>(null);
  const [renderKey, setRenderKey] = useState(0);

  const retryRender = () => {
    setRenderError(null);
    setRenderKey((current) => current + 1);
  };

  return (
    <Card className="mt-4 overflow-hidden border-muted">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Interactive visualization</CardTitle>
        {element.explanation ? (
          <CardDescription className="text-xs leading-relaxed">{element.explanation}</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="pt-0">
        <div className="relative min-h-[360px] w-full overflow-hidden rounded-md border bg-background">
          {renderError ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 p-4 text-center text-sm">
              <p className="max-w-md text-destructive">{renderError}</p>
              <Button type="button" variant="outline" size="sm" onClick={retryRender}>
                Try again
              </Button>
            </div>
          ) : element.library === 'react' ? (
            <ReactRenderer key={renderKey} code={element.code} onError={(msg) => setRenderError(msg)} />
          ) : (
            <SafeCodeRunner
              key={renderKey}
              code={element.code}
              library={element.library}
              onError={(msg) => setRenderError(msg)}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
