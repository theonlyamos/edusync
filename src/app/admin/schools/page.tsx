'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useHomeworkData } from '@/components/homework/shared';
import { NATIVE_SELECT_CLASS } from '@/components/school-portal/PersonFormDialog';
import { AdminPageHeader, Empty, LoadState, n, timeAgo } from '@/components/admin/AdminParts';
import { SchoolStatus } from '@/components/admin/SchoolStatus';
import type { AdminSchoolRow } from '@/lib/platform-admin';
import { cn } from '@/lib/utils';

type Filter = 'all' | 'trial' | 'low' | 'suspended';

export default function AdminSchoolsPage() {
  const schools = useHomeworkData<{ schools: AdminSchoolRow[] }>('/api/admin/schools');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (schools.data?.schools ?? []).filter((s) => {
      if (q && ![s.name, s.owner?.email, s.owner?.name, s.country].some((v) => v?.toLowerCase().includes(q))) return false;
      if (filter === 'trial') return s.isActive && s.credits.trialActive;
      if (filter === 'low') return s.isActive && !s.credits.trialActive && s.credits.low;
      if (filter === 'suspended') return !s.isActive;
      return true;
    });
  }, [schools.data, query, filter]);

  return (
    <div>
      <AdminPageHeader title="Schools" description="Every school on InsyteAI. Open one to see its people, credits and usage, or to help it." />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input aria-label="Search schools" className="pl-9" placeholder="Search by school, owner or country" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <select aria-label="Show" className={cn(NATIVE_SELECT_CLASS, 'sm:w-48')} value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
          <option value="all">All schools</option>
          <option value="trial">On a trial</option>
          <option value="low">Low on credits</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>
      <LoadState loading={schools.loading && !schools.data} error={schools.error} retry={schools.refresh}>
        <Card>
          <CardContent className="p-0">
            {rows.length === 0 ? (
              <Empty>{schools.data?.schools.length ? 'No schools match.' : 'No schools have registered yet.'}</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[48rem] text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr className="border-b">
                      <th className="px-4 py-3 font-medium">School</th>
                      <th className="px-3 py-3 font-medium">Owner</th>
                      <th className="px-3 py-3 text-right font-medium">Students</th>
                      <th className="px-3 py-3 text-right font-medium">Teachers</th>
                      <th className="px-3 py-3 text-right font-medium">Credits</th>
                      <th className="px-3 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Last activity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {rows.map((s) => (
                      <tr key={s.id} className="hover:bg-muted/40">
                        <td className="px-4 py-3">
                          <Link href={`/admin/schools/${s.id}`} className="font-medium hover:underline">{s.name}</Link>
                          <p className="text-xs text-muted-foreground">{[s.country, `joined ${new Date(s.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`].filter(Boolean).join(' · ')}</p>
                        </td>
                        <td className="px-3 py-3">
                          <p className="break-words">{s.owner?.name || '—'}</p>
                          <p className="break-all text-xs text-muted-foreground">{s.owner?.email}</p>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">{n(s.students)}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{n(s.teachers)}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{n(s.credits.total)}</td>
                        <td className="px-3 py-3"><SchoolStatus school={s} /></td>
                        <td className="px-4 py-3 text-muted-foreground">{s.lastActivityAt ? timeAgo(s.lastActivityAt) : 'Not in 90 days'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </LoadState>
    </div>
  );
}
