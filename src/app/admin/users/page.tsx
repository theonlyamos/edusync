'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useHomeworkData } from '@/components/homework/shared';
import { NATIVE_SELECT_CLASS } from '@/components/school-portal/PersonFormDialog';
import { AdminPageHeader, Empty, LoadState, Pill, n, timeAgo } from '@/components/admin/AdminParts';
import { ROLE_LABEL, type AdminUserRow } from '@/lib/platform-admin';
import { cn } from '@/lib/utils';

type Result = { users: AdminUserRow[]; total: number; page: number; pageSize: number };

export default function AdminUsersPage() {
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);

  // Search after typing stops, and go back to the first page.
  useEffect(() => {
    const id = setTimeout(() => {
      setQuery(text.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [text]);

  const params = new URLSearchParams({ page: String(page) });
  if (query) params.set('q', query);
  if (role) params.set('role', role);
  const result = useHomeworkData<Result>(`/api/admin/users?${params}`);
  const data = result.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div>
      <AdminPageHeader title="Users" description="Every account on InsyteAI. Open one to reset a password, give credits or turn off sign-in." />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input aria-label="Search accounts" className="pl-9" placeholder="Search by name or email" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <select
          aria-label="Role"
          className={cn(NATIVE_SELECT_CLASS, 'sm:w-48')}
          value={role}
          onChange={(e) => {
            setRole(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Everyone</option>
          <option value="student">Students</option>
          <option value="teacher">Teachers</option>
          <option value="learner">Learners</option>
          <option value="admin">Platform admins</option>
        </select>
      </div>
      <LoadState loading={result.loading && !data} error={result.error} retry={result.refresh}>
        {data && (
          <Card>
            <CardContent className="p-0">
              {data.users.length === 0 ? (
                <Empty>{query || role ? 'No accounts match.' : 'No accounts yet.'}</Empty>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[48rem] text-sm">
                    <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr className="border-b">
                        <th className="px-4 py-3 font-medium">Account</th>
                        <th className="px-3 py-3 font-medium">Role</th>
                        <th className="px-3 py-3 font-medium">School</th>
                        <th className="px-3 py-3 text-right font-medium">Own credits</th>
                        <th className="px-3 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium">Last sign-in</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {data.users.map((u) => (
                        <tr key={u.id} className="hover:bg-muted/40">
                          <td className="px-4 py-3">
                            <Link href={`/admin/users/${u.id}`} className="font-medium hover:underline">{u.name || u.email || 'Unnamed account'}</Link>
                            {u.name && <p className="break-all text-xs text-muted-foreground">{u.email}</p>}
                          </td>
                          <td className="px-3 py-3">{ROLE_LABEL[u.role] ?? u.role}</td>
                          <td className="px-3 py-3">
                            {u.school ? (
                              <Link href={`/admin/schools/${u.school.id}`} className="hover:underline">{u.school.name}</Link>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">{n(u.credits)}</td>
                          <td className="px-3 py-3">{u.isActive ? <Pill tone="good">Active</Pill> : <Pill tone="bad">Deactivated</Pill>}</td>
                          <td className="px-4 py-3 text-muted-foreground">{timeAgo(u.lastLogin)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}
        {data && data.total > data.pageSize && (
          <nav aria-label="Pages" className="mt-4 flex items-center justify-between gap-2 text-sm text-muted-foreground">
            <span>
              {n((data.page - 1) * data.pageSize + 1)}–{n(Math.min(data.total, data.page * data.pageSize))} of {n(data.total)}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1 || result.loading} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page >= pages || result.loading} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </nav>
        )}
      </LoadState>
    </div>
  );
}
