import { cn } from '@/lib/utils';

/** A subject's colour as a small dot. */
export function SubjectDot({ color, className }: { color: string | null | undefined; className?: string }) {
  return <span aria-hidden className={cn('inline-block h-3 w-3 shrink-0 rounded-full border', className)} style={{ backgroundColor: color ?? 'transparent' }} />;
}
