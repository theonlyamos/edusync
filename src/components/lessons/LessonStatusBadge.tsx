import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { LessonStatus } from '@/lib/lesson-record';

const LABELS: Record<LessonStatus, string> = { draft: 'Draft', live: 'Live', archived: 'Archived' };

const STYLES: Record<LessonStatus, string> = {
  draft: 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300',
  live: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300',
  archived: 'border-border bg-muted text-muted-foreground',
};

export function LessonStatusBadge({ status, version, className }: { status: LessonStatus; version?: number | null; className?: string }) {
  return (
    <Badge variant="outline" className={cn('font-medium', STYLES[status], className)}>
      {LABELS[status]}{status === 'live' && version ? ` · v${version}` : ''}
    </Badge>
  );
}
