'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef } from 'react';
import type { CodingEditorRequest } from '@/lib/lesson-artifacts/coding-editor-bridge';
import { Button } from '@/components/ui/button';

function UnavailableEditor({ data }: { data: { initialCode: string } }) {
  return <div className="space-y-2 p-3"><p role="status">The coding editor is unavailable. You can still edit your code below.</p><textarea aria-label="Code" className="h-80 w-full rounded border p-3 font-mono" defaultValue={data.initialCode} /></div>;
}

const Editor = dynamic(() => import('./CodeEditor').then(module => module.CodeEditor).catch(() => UnavailableEditor), {
  ssr: false,
  loading: () => <p role="status" className="p-3">Loading coding editor...</p>,
});

export function CodingWorkspace({ request, onClose }: { request: CodingEditorRequest | null; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (request) closeRef.current?.focus(); }, [request]);
  if (!request) return null;
  return <section aria-label="Coding workspace" data-lesson-coding-workspace className="absolute inset-0 z-20 flex min-h-0 flex-col overflow-auto rounded-lg border bg-background p-3 shadow-lg" onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); onClose(); } }}>
    <header className="mb-3 flex items-center justify-between gap-3"><h2 className="font-semibold">Coding workspace</h2><Button ref={closeRef} variant="outline" size="sm" onClick={onClose}>Close coding editor</Button></header>
    <Editor key={request.code} data={{ initialCode: request.code, language: request.language, tests: [] }} />
  </section>;
}
