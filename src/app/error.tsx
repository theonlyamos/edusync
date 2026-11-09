'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="min-h-[60vh] flex flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="space-y-2">
        <h1 className="text-3xl">Something went wrong</h1>
        <p className="text-muted-foreground max-w-md">
          This page hit a problem. Your work elsewhere is safe. Try again, and if it keeps happening, let us know.
        </p>
        {error.digest ? <p className="text-xs text-muted-foreground">Reference: {error.digest}</p> : null}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button asChild variant="outline">
          <Link href="/support">Get help</Link>
        </Button>
      </div>
    </main>
  );
}
