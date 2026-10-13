'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Expand, X, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function LearningActivityView({ children }: { children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const [zoom, setZoom] = useState(1);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const expandRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef(false);
  const titleId = useId();

  const fit = () => {
    setZoom(1);
    viewportRef.current?.scrollTo({ left: 0, top: 0 });
  };

  const open = () => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.matches(':modal')) return;
    dialog.removeAttribute('open');
    dialog.showModal();
    fit();
    setExpanded(true);
  };

  const restoreInline = () => {
    dialogRef.current?.setAttribute('open', '');
    restoreFocusRef.current = true;
    fit();
    setExpanded(false);
  };

  useEffect(() => {
    if (!expanded) {
      if (restoreFocusRef.current) {
        restoreFocusRef.current = false;
        expandRef.current?.focus();
      }
      return;
    }
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleEscape = (event: MessageEvent) => {
      const dialog = dialogRef.current;
      if (event.data?.type === 'lesson-viewer-escape' &&
        event.source === dialog?.querySelector('iframe')?.contentWindow && dialog?.matches(':modal')) {
        dialog.close();
      }
    };
    window.addEventListener('message', handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('message', handleEscape);
    };
  }, [expanded]);

  return (
    <dialog
      ref={dialogRef}
      open
      onClose={restoreInline}
      aria-modal={expanded || undefined}
      aria-label={expanded ? undefined : 'Learning activity'}
      aria-labelledby={expanded ? titleId : undefined}
      className={`flex min-w-0 flex-col gap-2 border-0 text-foreground ${expanded
        ? 'fixed inset-0 m-auto h-[calc(100dvh-1rem)] max-h-[60rem] w-[calc(100%-1rem)] max-w-6xl overflow-hidden rounded-lg bg-background p-3 shadow-xl backdrop:bg-black/50 sm:p-6'
        : 'relative m-0 h-full w-full max-h-none max-w-none overflow-visible bg-transparent p-0'}`}
    >
      <span tabIndex={expanded ? 0 : -1} className="sr-only" onFocus={() => {
        if (!expanded) return;
        const iframe = dialogRef.current?.querySelector('iframe');
        iframe?.focus();
        if (document.activeElement !== iframe) viewportRef.current?.focus();
      }} />
      <div className={expanded ? 'flex shrink-0 items-center justify-between gap-2' : 'hidden'}>
        <h2 id={titleId} className="text-base font-semibold">Learning activity</h2>
        <Button ref={closeRef} type="button" variant="outline" size="icon" className="h-11 w-11 shrink-0" aria-label="Close expanded activity" onClick={() => dialogRef.current?.close()}>
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-2">
        <Button ref={expandRef} type="button" variant="outline" size="sm" className={expanded ? 'hidden' : 'h-11 gap-2'} aria-label="Expand learning activity" onClick={open}>
          <Expand className="h-4 w-4" aria-hidden="true" />Expand
        </Button>
        <div className={expanded ? 'flex w-full items-center gap-2' : 'hidden'} role="group" aria-label="Activity zoom controls">
          <Button type="button" variant="outline" className="h-11" onClick={fit}>Fit</Button>
          <Button type="button" variant="outline" size="icon" className="h-11 w-11" aria-label="Zoom out" disabled={zoom === 1} onClick={() => setZoom(value => Math.max(1, value - 0.5))}>
            <ZoomOut className="h-4 w-4" aria-hidden="true" />
          </Button>
          <span className="min-w-12 text-center text-sm tabular-nums" aria-live="polite" aria-atomic="true">{zoom * 100}%</span>
          <Button type="button" variant="outline" size="icon" className="h-11 w-11" aria-label="Zoom in" disabled={zoom === 4} onClick={() => setZoom(value => Math.min(4, value + 0.5))}>
            <ZoomIn className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
      <div ref={viewportRef} className="min-h-0 min-w-0 flex-1 overflow-auto rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" role="region" aria-label="Learning activity, scroll to explore when zoomed" tabIndex={expanded ? 0 : undefined}>
        <div style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}>
          <div className="relative" style={{ width: `${100 / zoom}%`, height: `${100 / zoom}%`, transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
            {children}
          </div>
        </div>
      </div>
      <span tabIndex={expanded ? 0 : -1} className="sr-only" onFocus={() => { if (expanded) closeRef.current?.focus(); }} />
    </dialog>
  );
}
