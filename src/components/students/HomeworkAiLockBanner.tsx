'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { BookOpenCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface HomeworkAiLock {
  homeworkId: string;
  title: string;
  dueAt: string;
}

/** Pages whose AI tools pause while a homework attempt is open. */
const AI_PAGES = [/^\/students\/tutor/, /^\/students\/learn/, /^\/students\/practice/, /^\/students\/collaborator/, /^\/students\/lessons\/[^/]+/];

export function isStudentAiPage(pathname: string | null) {
  return Boolean(pathname && AI_PAGES.some((page) => page.test(pathname)));
}

function formatDue(dueAt: string) {
  const date = new Date(dueAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

export function HomeworkAiLockBanner() {
  const { data: lock } = useQuery({
    queryKey: ['students', 'homework-lock'],
    queryFn: async (): Promise<HomeworkAiLock | null> => {
      const res = await fetch('/api/students/homework-lock', { cache: 'no-store' });
      if (!res.ok) return null;
      const body = await res.json();
      return body.lock ?? null;
    },
    staleTime: 30_000,
  });
  if (!lock) return null;
  const due = formatDue(lock.dueAt);
  return (
    <div role="status" className="flex flex-col gap-3 border-b border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <BookOpenCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
        <p>
          <span className="font-medium">AI tools are paused while &ldquo;{lock.title}&rdquo; is open.</span>{' '}
          <span className="text-muted-foreground">
            Submit it{due ? ` (due ${due})` : ''} or use the help inside the homework. They come back once it&rsquo;s submitted or due.
          </span>
        </p>
      </div>
      <Button asChild size="sm" className="shrink-0 self-start sm:self-auto">
        <Link href={`/students/homework/${lock.homeworkId}`}>Go to homework</Link>
      </Button>
    </div>
  );
}
