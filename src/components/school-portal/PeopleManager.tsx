'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import axios from 'axios';
import { FileUp, Loader2, MoreHorizontal, Search, UserPlus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { AccountLinkNotice, type LinkResult } from '@/components/school-portal/AccountLinkNotice';
import { ImportPeopleDialog } from '@/components/school-portal/ImportPeopleDialog';
import { NATIVE_SELECT_CLASS, PersonFormDialog } from '@/components/school-portal/PersonFormDialog';
import { SchoolPageHeader, useSchoolPortal } from '@/components/school-portal/SchoolPortalProvider';
import { GRADE_LEVELS } from '@/lib/constants';
import { gradeLevelLabel } from '@/lib/school-registration';
import { ACCOUNT_STATUS_LABEL, type AccountStatus, type SchoolPersonRole } from '@/lib/school-people';
import type { SchoolPerson } from '@/lib/school-people.server';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 50;

const COPY: Record<SchoolPersonRole, { title: string; description: string; noun: string; plural: string }> = {
  student: {
    title: 'Students',
    description: 'Add students, keep their grade and guardian details up to date, and turn accounts on or off.',
    noun: 'student',
    plural: 'students',
  },
  teacher: {
    title: 'Teachers',
    description: 'Add teachers, record what they teach, and turn accounts on or off.',
    noun: 'teacher',
    plural: 'teachers',
  },
  admin: {
    title: 'Administrators',
    description: 'Administrators manage the school with you: people, timetables, settings and billing.',
    noun: 'administrator',
    plural: 'administrators',
  },
};

const STATUS_STYLE: Record<AccountStatus, string> = {
  active: 'border-green-600/30 bg-green-600/10 text-green-700 dark:text-green-400',
  pending: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  link_expired: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300',
  deactivated: 'border-muted-foreground/30 bg-muted text-muted-foreground',
};

type StatusFilter = 'all' | 'active' | 'pending' | 'deactivated';

type ListResponse = {
  people: SchoolPerson[];
  gradeLevels: string[];
  emailConfigured: boolean;
  viewer: { userId: string; role: string };
};

function errorMessage(error: unknown, fallback: string) {
  return (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback;
}

function StatusBadge({ status }: { status: AccountStatus }) {
  return <Badge variant="outline" className={cn('whitespace-nowrap font-normal', STATUS_STYLE[status])}>{ACCOUNT_STATUS_LABEL[status]}</Badge>;
}

const formatDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** The Students, Teachers and Administrators pages. */
export function PeopleManager({ role }: { role: SchoolPersonRole }) {
  const copy = COPY[role];
  const { isOwner, school } = useSchoolPortal();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>(() => {
    const s = searchParams?.get('status');
    return s === 'active' || s === 'pending' || s === 'deactivated' ? s : 'all';
  });
  const [grade, setGrade] = useState(() => searchParams?.get('grade') ?? '');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [formOpen, setFormOpen] = useState(() => searchParams?.get('add') === '1');
  const [editing, setEditing] = useState<SchoolPerson | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [confirm, setConfirm] = useState<{ people: SchoolPerson[]; active: boolean } | null>(null);
  const [gradeMove, setGradeMove] = useState<{ people: SchoolPerson[]; to: string } | null>(null);
  const [linkSent, setLinkSent] = useState<{ person: SchoolPerson; result: LinkResult & { kind: 'activate' | 'reset' } } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data: body } = await axios.get<ListResponse>(`/api/schools/current/people?role=${role}`);
      setData(body);
      setLoadError(null);
    } catch (err) {
      setLoadError(errorMessage(err, `Could not load ${copy.plural}.`));
    } finally {
      setLoading(false);
    }
  }, [role, copy.plural]);

  useEffect(() => { void load(); }, [load]);

  // Drop ?add=1 once the dialog has opened, so a reload doesn't reopen it.
  useEffect(() => {
    if (searchParams?.get('add') === '1') router.replace(pathname ?? `/school/${role}s`, { scroll: false });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const schoolGrades = data?.gradeLevels ?? school.gradeLevels;
  const canManageAdmins = isOwner;
  const canAdd = role !== 'admin' || canManageAdmins;
  const viewerId = data?.viewer.userId;
  const canEdit = (p: SchoolPerson) => role !== 'admin' || canManageAdmins || p.userId === viewerId;
  const canToggle = (p: SchoolPerson) => p.role !== 'owner' && p.userId !== viewerId && (role !== 'admin' || canManageAdmins);
  const bulkEnabled = role !== 'admin';

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.people ?? []).filter((p) => {
      if (q && !p.name.toLowerCase().includes(q) && !p.email.toLowerCase().includes(q)) return false;
      if (status === 'active' && p.status !== 'active') return false;
      if (status === 'pending' && p.status !== 'pending' && p.status !== 'link_expired') return false;
      if (status === 'deactivated' && p.status !== 'deactivated') return false;
      if (grade) {
        if (role === 'student' && (p.gradeLevel ?? 'none') !== grade) return false;
        if (role === 'teacher' && !(p.grades ?? []).includes(grade)) return false;
      }
      return true;
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [data, query, status, grade, role]);

  useEffect(() => { setPage(0); }, [query, status, grade]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const selectedPeople = (data?.people ?? []).filter((p) => selected.has(p.memberId));
  const allVisibleSelected = visible.length > 0 && visible.every((p) => selected.has(p.memberId) || !canToggle(p));

  const toggleOne = (id: string, on: boolean) => setSelected((s) => {
    const next = new Set(s);
    if (on) next.add(id); else next.delete(id);
    return next;
  });
  const toggleVisible = (on: boolean) => setSelected((s) => {
    const next = new Set(s);
    for (const p of visible) {
      if (!canToggle(p)) continue;
      if (on) next.add(p.memberId); else next.delete(p.memberId);
    }
    return next;
  });

  const counts = useMemo(() => {
    const people = data?.people ?? [];
    return {
      all: people.length,
      active: people.filter((p) => p.status === 'active').length,
      pending: people.filter((p) => p.status === 'pending' || p.status === 'link_expired').length,
      deactivated: people.filter((p) => p.status === 'deactivated').length,
    };
  }, [data]);

  const sendLink = async (person: SchoolPerson) => {
    setBusy(true);
    try {
      const { data: result } = await axios.post(`/api/schools/current/people/${person.memberId}/link`);
      if (result.emailed) {
        toast({ title: result.kind === 'activate' ? 'Activation email sent' : 'Password email sent', description: `Sent to ${person.email}.` });
      } else {
        setLinkSent({ person, result });
      }
      void load();
    } catch (err) {
      toast({ title: 'Could not send the link', description: errorMessage(err, 'Please try again.'), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const setActive = async (people: SchoolPerson[], active: boolean) => {
    setBusy(true);
    try {
      if (people.length === 1) {
        await axios.patch(`/api/schools/current/people/${people[0].memberId}`, { isActive: active });
      } else {
        const { data: result } = await axios.post('/api/schools/current/people/bulk', {
          action: active ? 'reactivate' : 'deactivate',
          memberIds: people.map((p) => p.memberId),
        });
        if (result.failed?.length) {
          toast({ title: `${result.failed.length} could not be changed`, description: result.failed[0].error, variant: 'destructive' });
        }
      }
      toast({ title: active ? 'Reactivated' : 'Deactivated', description: people.length === 1 ? people[0].name : `${people.length} ${copy.plural}` });
      setSelected(new Set());
      setConfirm(null);
      await load();
    } catch (err) {
      toast({ title: 'Could not change access', description: errorMessage(err, 'Please try again.'), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const moveGrade = async () => {
    if (!gradeMove?.to) return;
    setBusy(true);
    try {
      await axios.post('/api/schools/current/people/bulk', {
        action: 'set-grade',
        gradeLevel: gradeMove.to,
        memberIds: gradeMove.people.map((p) => p.memberId),
      });
      toast({ title: 'Grade changed', description: `${gradeMove.people.length} moved to ${gradeLevelLabel(gradeMove.to)}.` });
      setGradeMove(null);
      setSelected(new Set());
      await load();
    } catch (err) {
      toast({ title: 'Could not change the grade', description: errorMessage(err, 'Please try again.'), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const gradeFilterOptions = role === 'student'
    ? [...new Set([...schoolGrades, ...(data?.people ?? []).map((p) => p.gradeLevel ?? 'none')])]
        .sort((a, b) => (GRADE_LEVELS as readonly string[]).indexOf(a) - (GRADE_LEVELS as readonly string[]).indexOf(b))
    : schoolGrades;

  const detail = (p: SchoolPerson) => {
    if (role === 'student') return p.gradeLevel ? gradeLevelLabel(p.gradeLevel) : 'No grade';
    if (role === 'teacher') {
      const subjects = (p.subjects ?? []).join(', ');
      const grades = (p.grades ?? []).map(gradeLevelLabel).join(', ');
      return [subjects, grades].filter(Boolean).join(' · ') || 'No subjects yet';
    }
    return p.role === 'owner' ? 'Owner' : 'Administrator';
  };

  const actions = (p: SchoolPerson) => {
    const linkLabel = p.status === 'active' ? 'Send password reset' : 'Resend activation email';
    const items = [
      canEdit(p) && p.role !== 'owner' && <DropdownMenuItem key="edit" onSelect={() => setEditing(p)}>Edit details</DropdownMenuItem>,
      canEdit(p) && p.status !== 'deactivated' && p.userId !== viewerId && (
        <DropdownMenuItem key="link" onSelect={() => sendLink(p)}>{linkLabel}</DropdownMenuItem>
      ),
      canToggle(p) && <DropdownMenuSeparator key="sep" />,
      canToggle(p) && (p.isActive ? (
        <DropdownMenuItem key="off" className="text-red-600 focus:text-red-600" onSelect={() => setConfirm({ people: [p], active: false })}>Deactivate</DropdownMenuItem>
      ) : (
        <DropdownMenuItem key="on" onSelect={() => setActive([p], true)}>Reactivate</DropdownMenuItem>
      )),
    ].filter(Boolean);
    if (items.length === 0) return null;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-9 w-9" aria-label={`Actions for ${p.name}`} disabled={busy}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">{items}</DropdownMenuContent>
      </DropdownMenu>
    );
  };

  return (
    <div>
      <SchoolPageHeader
        title={copy.title}
        description={copy.description}
        actions={canAdd && (
          <>
            {role !== 'admin' && (
              <Button variant="outline" onClick={() => setImportOpen(true)}><FileUp className="mr-2 h-4 w-4" />Import CSV</Button>
            )}
            <Button onClick={() => { setEditing(null); setFormOpen(true); }}><UserPlus className="mr-2 h-4 w-4" />Add {copy.noun}</Button>
          </>
        )}
      />

      {role === 'admin' && !canManageAdmins && (
        <p className="mb-4 rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">Only the school owner can add or change administrators.</p>
      )}
      {data && !data.emailConfigured && canAdd && (
        <p className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          School email isn’t set up yet, so activation emails can’t go out. After adding someone you’ll get their activation link to pass on yourself.
        </p>
      )}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or email" className="pl-9" aria-label={`Search ${copy.plural}`} />
        </div>
        <select className={cn(NATIVE_SELECT_CLASS, 'sm:w-52')} value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} aria-label="Account status">
          <option value="all">Everyone ({counts.all})</option>
          <option value="active">Active ({counts.active})</option>
          <option value="pending">Not activated yet ({counts.pending})</option>
          <option value="deactivated">Deactivated ({counts.deactivated})</option>
        </select>
        {role !== 'admin' && gradeFilterOptions.length > 0 && (
          <select className={cn(NATIVE_SELECT_CLASS, 'sm:w-44')} value={grade} onChange={(e) => setGrade(e.target.value)} aria-label="Grade">
            <option value="">All grades</option>
            {gradeFilterOptions.map((g) => <option key={g} value={g}>{g === 'none' ? 'No grade' : gradeLevelLabel(g)}</option>)}
          </select>
        )}
      </div>

      {bulkEnabled && selectedPeople.length > 0 && (
        <div className="sticky top-0 z-10 mb-4 flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3 shadow-sm">
          <span className="mr-auto text-sm font-medium">{selectedPeople.length} selected</span>
          {role === 'student' && (
            <Button size="sm" variant="outline" onClick={() => setGradeMove({ people: selectedPeople, to: '' })} disabled={busy}>Change grade</Button>
          )}
          {selectedPeople.some((p) => p.isActive) && (
            <Button size="sm" variant="outline" onClick={() => setConfirm({ people: selectedPeople.filter((p) => p.isActive), active: false })} disabled={busy}>Deactivate</Button>
          )}
          {selectedPeople.some((p) => !p.isActive) && (
            <Button size="sm" variant="outline" onClick={() => setActive(selectedPeople.filter((p) => !p.isActive), true)} disabled={busy}>Reactivate</Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" aria-label="Loading" /></div>
      ) : loadError ? (
        <div className="rounded-lg border p-6 text-sm">
          <p className="text-destructive">{loadError}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => { setLoading(true); void load(); }}>Try again</Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="font-medium">{(data?.people.length ?? 0) === 0 ? `No ${copy.plural} yet` : `No ${copy.plural} match`}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {(data?.people.length ?? 0) === 0
              ? canAdd ? `Add ${copy.plural} one at a time, or import a CSV of them.` : ''
              : 'Try a different search or filter.'}
          </p>
          {(data?.people.length ?? 0) === 0 && canAdd && (
            <Button className="mt-4" onClick={() => { setEditing(null); setFormOpen(true); }}><UserPlus className="mr-2 h-4 w-4" />Add {copy.noun}</Button>
          )}
        </div>
      ) : (
        <>
          {/* Phones: cards */}
          <ul className="space-y-2 md:hidden">
            {visible.map((p) => (
              <li key={p.memberId} className="flex items-start gap-3 rounded-lg border bg-card p-3">
                {bulkEnabled && (
                  <Checkbox className="mt-1" checked={selected.has(p.memberId)} disabled={!canToggle(p)} onCheckedChange={(on) => toggleOne(p.memberId, on === true)} aria-label={`Select ${p.name}`} />
                )}
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="break-words font-medium">{p.name}</p>
                  <p className="break-all text-sm text-muted-foreground">{p.email}</p>
                  <p className="text-sm">{detail(p)}</p>
                  <StatusBadge status={p.status} />
                </div>
                {actions(p)}
              </li>
            ))}
          </ul>

          {/* Larger screens: table */}
          <div className="hidden overflow-x-auto rounded-lg border md:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  {bulkEnabled && (
                    <th className="w-10 px-3 py-2">
                      <Checkbox checked={allVisibleSelected} onCheckedChange={(on) => toggleVisible(on === true)} aria-label="Select everyone on this page" />
                    </th>
                  )}
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">{role === 'student' ? 'Grade' : role === 'teacher' ? 'Teaches' : 'Role'}</th>
                  {role === 'student' && <th className="px-3 py-2 font-medium">Guardian</th>}
                  {role === 'teacher' && <th className="px-3 py-2 font-medium">Lessons</th>}
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Added</th>
                  <th className="w-12 px-3 py-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {visible.map((p) => (
                  <tr key={p.memberId} className={cn(!p.isActive && 'text-muted-foreground')}>
                    {bulkEnabled && (
                      <td className="px-3 py-2">
                        <Checkbox checked={selected.has(p.memberId)} disabled={!canToggle(p)} onCheckedChange={(on) => toggleOne(p.memberId, on === true)} aria-label={`Select ${p.name}`} />
                      </td>
                    )}
                    <td className="px-3 py-2">
                      <div className="font-medium text-foreground">{p.name}{p.userId === viewerId && <span className="ml-2 text-xs font-normal text-muted-foreground">(you)</span>}</div>
                      <div className="break-all text-muted-foreground">{p.email}</div>
                    </td>
                    <td className="max-w-xs px-3 py-2">{detail(p)}</td>
                    {role === 'student' && (
                      <td className="px-3 py-2">
                        {p.guardianName || p.guardianContact ? (
                          <>
                            <div>{p.guardianName}</div>
                            <div className="text-muted-foreground">{p.guardianContact}</div>
                          </>
                        ) : <span className="text-muted-foreground">Not added</span>}
                      </td>
                    )}
                    {role === 'teacher' && <td className="px-3 py-2 tabular-nums">{p.lessonCount ?? 0}</td>}
                    <td className="px-3 py-2"><StatusBadge status={p.status} /></td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{formatDate(p.joinedAt)}</td>
                    <td className="px-3 py-2 text-right">{actions(p)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pageCount > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {page * PAGE_SIZE + 1}–{Math.min(filtered.length, (page + 1) * PAGE_SIZE)} of {filtered.length}
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <Button size="sm" variant="outline" disabled={page >= pageCount - 1} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </>
      )}

      <PersonFormDialog
        role={role}
        open={formOpen || Boolean(editing)}
        onOpenChange={(open) => { if (!open) { setFormOpen(false); setEditing(null); } }}
        person={editing}
        schoolGrades={schoolGrades}
        onSaved={load}
      />
      <ImportPeopleDialog role={role} open={importOpen} onOpenChange={setImportOpen} schoolGrades={schoolGrades} onDone={load} />

      <Dialog open={Boolean(confirm)} onOpenChange={(open) => { if (!open) setConfirm(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Deactivate {confirm?.people.length === 1 ? confirm.people[0].name : `${confirm?.people.length} ${copy.plural}`}?
            </DialogTitle>
            <DialogDescription>
              They won’t be able to sign in to the school until you reactivate them. Their lessons, homework and history stay.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setConfirm(null)} disabled={busy}>Cancel</Button>
            <Button variant="destructive" onClick={() => confirm && setActive(confirm.people, false)} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Deactivate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(gradeMove)} onOpenChange={(open) => { if (!open) setGradeMove(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move {gradeMove?.people.length} {gradeMove?.people.length === 1 ? 'student' : 'students'} to another grade</DialogTitle>
            <DialogDescription>They’ll see lessons, homework and live classes for the new grade.</DialogDescription>
          </DialogHeader>
          <select
            className={NATIVE_SELECT_CLASS}
            value={gradeMove?.to ?? ''}
            onChange={(e) => setGradeMove((g) => (g ? { ...g, to: e.target.value } : g))}
            aria-label="New grade"
          >
            <option value="" disabled>Pick a grade</option>
            {(schoolGrades.length ? schoolGrades : [...GRADE_LEVELS]).map((g) => <option key={g} value={g}>{gradeLevelLabel(g)}</option>)}
          </select>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setGradeMove(null)} disabled={busy}>Cancel</Button>
            <Button onClick={moveGrade} disabled={busy || !gradeMove?.to}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Move'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(linkSent)} onOpenChange={(open) => { if (!open) setLinkSent(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{linkSent?.result.kind === 'activate' ? 'New activation link' : 'Password reset link'} for {linkSent?.person.name}</DialogTitle>
            <DialogDescription>Any earlier link for this person no longer works.</DialogDescription>
          </DialogHeader>
          {linkSent && <AccountLinkNotice result={linkSent.result} email={linkSent.person.email} kind={linkSent.result.kind} />}
          <DialogFooter><Button onClick={() => setLinkSent(null)}>Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
