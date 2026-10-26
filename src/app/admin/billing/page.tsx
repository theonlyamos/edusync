'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useHomeworkData } from '@/components/homework/shared';
import { NATIVE_SELECT_CLASS } from '@/components/school-portal/PersonFormDialog';
import { AdminPageHeader, Empty, LoadState, Pill, StatTile, formatDateTime, n, plural } from '@/components/admin/AdminParts';
import { formatDollars, monthLabel, type BillingRow, type BillingSummary } from '@/lib/platform-admin';
import { cn } from '@/lib/utils';

const KIND: Record<BillingRow['kind'], { label: string; tone: 'good' | 'muted' | 'warn' | 'bad' }> = {
  purchase: { label: 'Purchase', tone: 'good' },
  grant: { label: 'Given free', tone: 'muted' },
  trial: { label: 'Trial', tone: 'muted' },
  refund: { label: 'Refund', tone: 'warn' },
};

type Filter = 'all' | BillingRow['kind'];

export default function AdminBillingPage() {
  const billing = useHomeworkData<BillingSummary>('/api/admin/billing');
  const [filter, setFilter] = useState<Filter>('all');
  const data = billing.data;
  const rows = useMemo(() => (data?.rows ?? []).filter((r) => filter === 'all' || r.kind === filter), [data, filter]);
  const thisMonth = data?.months.at(-1);
  const lastMonth = data?.months.at(-2);
  const peak = Math.max(1, ...(data?.months.map((m) => m.dollars) ?? [0]));

  return (
    <div>
      <AdminPageHeader title="Billing" description="Credit purchases by schools and people, plus credits given free, over the last 12 months. One credit sells for $0.10." />
      <LoadState loading={billing.loading && !data} error={billing.error} retry={billing.refresh}>
        {data && thisMonth && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatTile label="Revenue this month" value={formatDollars(thisMonth.dollars)} now={thisMonth.dollars} before={lastMonth?.dollars ?? 0} detail={`${n(thisMonth.credits)} credits sold`} />
              <StatTile label="Revenue, last 12 months" value={formatDollars(data.totals.dollars)} detail={plural(data.totals.purchases, 'purchase')} />
              <StatTile label="Credits sold, 12 months" value={n(data.totals.credits)} />
              <StatTile label="Credits given free, 12 months" value={n(data.totals.granted)} detail="Trials and admin grants" />
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">By month</CardTitle>
                <CardDescription>Schools and people paying for credits.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[40rem] text-sm">
                    <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr className="border-b">
                        <th className="px-4 py-3 font-medium">Month</th>
                        <th className="px-3 py-3 font-medium">Revenue</th>
                        <th className="px-3 py-3 text-right font-medium">Schools</th>
                        <th className="px-3 py-3 text-right font-medium">People</th>
                        <th className="px-3 py-3 text-right font-medium">Credits sold</th>
                        <th className="px-4 py-3 text-right font-medium">Given free</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {[...data.months].reverse().map((m) => (
                        <tr key={m.month}>
                          <td className="whitespace-nowrap px-4 py-2.5">{monthLabel(m.month)}</td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-3">
                              <span className="w-16 shrink-0 tabular-nums">{formatDollars(m.dollars)}</span>
                              <span className="h-2 flex-1 rounded-full bg-muted" aria-hidden>
                                <span className="block h-2 rounded-full bg-primary" style={{ width: `${(m.dollars / peak) * 100}%` }} />
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{formatDollars(m.schoolDollars)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{formatDollars(m.personDollars)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{n(m.credits)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{n(m.granted)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-col gap-2 pb-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <CardTitle className="text-lg">Transactions</CardTitle>
                  <CardDescription>Newest first{data.rows.length >= 500 ? ', latest 500' : ''}.</CardDescription>
                </div>
                <select aria-label="Show" className={cn(NATIVE_SELECT_CLASS, 'sm:w-44')} value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
                  <option value="all">Everything</option>
                  <option value="purchase">Purchases</option>
                  <option value="grant">Given free</option>
                  <option value="trial">Trials</option>
                  <option value="refund">Refunds</option>
                </select>
              </CardHeader>
              <CardContent className="p-0">
                {rows.length === 0 ? <Empty>Nothing here yet.</Empty> : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[44rem] text-sm">
                      <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <tr className="border-b">
                          <th className="px-4 py-3 font-medium">When</th>
                          <th className="px-3 py-3 font-medium">Who</th>
                          <th className="px-3 py-3 font-medium">Type</th>
                          <th className="px-3 py-3 text-right font-medium">Credits</th>
                          <th className="px-3 py-3 text-right font-medium">Amount</th>
                          <th className="px-4 py-3 font-medium">Note</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {rows.map((r) => (
                          <tr key={`${r.payer}-${r.id}`}>
                            <td className="whitespace-nowrap px-4 py-2.5">{formatDateTime(r.at)}</td>
                            <td className="px-3 py-2.5">
                              <Link href={r.href} className="font-medium hover:underline">{r.name}</Link>
                              <p className="text-xs text-muted-foreground">{r.payer === 'school' ? 'School' : 'Person'}</p>
                            </td>
                            <td className="px-3 py-2.5"><Pill tone={KIND[r.kind].tone}>{KIND[r.kind].label}</Pill></td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{n(r.credits)}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{r.kind === 'purchase' ? formatDollars(r.dollars) : '—'}</td>
                            <td className="min-w-[12rem] break-words px-4 py-2.5 text-muted-foreground">
                              {r.description || '—'}
                              {r.stripePaymentIntent && <span className="block break-all text-xs">Stripe {r.stripePaymentIntent}</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </LoadState>
    </div>
  );
}
