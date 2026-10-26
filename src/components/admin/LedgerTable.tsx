'use client';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Empty, formatDateTime, n } from '@/components/admin/AdminParts';
import type { AdminLedgerRow } from '@/lib/platform-admin';
import { cn } from '@/lib/utils';

const TYPE_LABEL: Record<string, string> = {
  purchase: 'Purchase',
  refund: 'Refund',
  adjustment: 'Adjustment',
  bonus: 'Bonus',
  usage: 'Usage',
  trial: 'Trial',
};

/** Credit movements for a school or a person. */
export function LedgerTable({ rows, showBalance = false }: { rows: AdminLedgerRow[]; showBalance?: boolean }) {
  if (rows.length === 0) return <Empty>No credit movements yet.</Empty>;
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>Type</TableHead>
            <TableHead className="text-right">Credits</TableHead>
            {showBalance && <TableHead className="text-right">Balance after</TableHead>}
            <TableHead>Description</TableHead>
            <TableHead>By</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="whitespace-nowrap text-sm">{formatDateTime(row.createdAt)}</TableCell>
              <TableCell className="whitespace-nowrap text-sm">{TYPE_LABEL[row.type] ?? row.type}</TableCell>
              <TableCell className={cn('whitespace-nowrap text-right tabular-nums', row.credits > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground')}>
                {row.credits > 0 ? '+' : ''}{n(row.credits)}
              </TableCell>
              {showBalance && <TableCell className="text-right tabular-nums">{row.balanceAfter === null ? '—' : n(row.balanceAfter)}</TableCell>}
              <TableCell className="min-w-[12rem] break-words text-sm">{row.description || '—'}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{row.by || '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
