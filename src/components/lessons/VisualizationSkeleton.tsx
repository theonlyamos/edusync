import { cn } from '@/lib/utils';

/**
 * Skeleton loading view shown while an interactive visualization is being prepared —
 * both while a sandboxed renderer boots its iframe and while a regeneration request is
 * in flight. Defaults to filling its nearest positioned ancestor (`absolute inset-0`).
 */
export function VisualizationSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'absolute inset-0 flex flex-col gap-4 rounded-lg border border-border bg-muted/30 p-6',
        className,
      )}
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading your interactive preview. This usually takes a few seconds.</span>
      <div className="h-7 w-2/3 max-w-sm rounded-md bg-muted animate-pulse" />
      <div className="flex min-h-0 flex-1 flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="h-4 w-full rounded bg-muted animate-pulse" />
        <div className="h-4 w-11/12 rounded bg-muted animate-pulse" />
        <div className="mt-2 flex flex-1 gap-3">
          <div className="h-full min-h-[100px] flex-1 rounded-lg bg-muted animate-pulse" />
          <div className="flex w-28 flex-col justify-center gap-2">
            <div className="h-3 w-full rounded bg-muted animate-pulse" />
            <div className="h-8 w-full rounded-md bg-muted animate-pulse" />
          </div>
        </div>
      </div>
      <p className="text-center text-sm text-muted-foreground">Loading your interactive preview…</p>
    </div>
  );
}
