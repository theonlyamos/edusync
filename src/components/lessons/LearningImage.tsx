'use client';

import { useRef, useState, type ReactEventHandler } from 'react';
import { Expand, ZoomIn, ZoomOut } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

export function LearningImage({
  src,
  alt,
  caption,
  onLoad,
  onError,
}: {
  src: string;
  alt: string;
  caption?: string;
  onLoad?: ReactEventHandler<HTMLImageElement>;
  onError?: ReactEventHandler<HTMLImageElement>;
}) {
  const [zoom, setZoom] = useState(1);
  const viewportRef = useRef<HTMLDivElement>(null);

  const fitImage = () => {
    setZoom(1);
    viewportRef.current?.scrollTo({ left: 0, top: 0 });
  };

  return (
    <figure className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
      {/* Signed private URLs must bypass Next image optimization. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} onLoad={onLoad} onError={onError} className="col-span-2 block h-auto max-h-[min(60dvh,48rem)] w-full rounded-lg object-contain" />
      <Dialog onOpenChange={fitImage}>
        <DialogTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="col-start-2 row-start-2 h-11 gap-2" aria-label="Expand learning image">
            <Expand className="h-4 w-4" aria-hidden="true" />Expand
          </Button>
        </DialogTrigger>
        <DialogContent className="flex h-[calc(100dvh-1rem)] max-h-[60rem] w-[calc(100%-1rem)] max-w-6xl flex-col gap-3 overflow-hidden rounded-lg p-3 sm:p-6 [&>button]:flex [&>button]:h-11 [&>button]:w-11 [&>button]:items-center [&>button]:justify-center">
          <div className="space-y-2 pr-12">
            <DialogTitle className="text-base">Learning image</DialogTitle>
            <DialogDescription className="max-h-[20dvh] overflow-y-auto break-words">
              {caption || 'Zoom in to read labels, then scroll to explore the image.'}
            </DialogDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2" role="group" aria-label="Image zoom controls">
            <Button type="button" variant="outline" className="h-11" onClick={fitImage}>Fit</Button>
            <Button type="button" variant="outline" size="icon" className="h-11 w-11" aria-label="Zoom out" disabled={zoom === 1} onClick={() => setZoom((value) => Math.max(1, value - 0.5))}>
              <ZoomOut className="h-4 w-4" aria-hidden="true" />
            </Button>
            <span className="min-w-12 text-center text-sm tabular-nums" aria-live="polite" aria-atomic="true">{zoom * 100}%</span>
            <Button type="button" variant="outline" size="icon" className="h-11 w-11" aria-label="Zoom in" disabled={zoom === 4} onClick={() => setZoom((value) => Math.min(4, value + 0.5))}>
              <ZoomIn className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
          <div ref={viewportRef} className="min-h-0 min-w-0 flex-1 overflow-auto rounded-lg border bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" role="region" aria-label="Learning image, scroll to explore when zoomed" tabIndex={0}>
            <div style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={alt} onError={onError} className="h-full w-full max-w-none object-contain" />
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {caption && <figcaption className="col-start-1 row-start-2 min-w-0 break-words text-sm text-muted-foreground">{caption}</figcaption>}
    </figure>
  );
}
