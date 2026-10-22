'use client';

import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import axios from 'axios';
import { Archive, ArchiveRestore, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { useHomeworkData } from '@/components/homework/shared';
import { NATIVE_SELECT_CLASS } from '@/components/school-portal/PersonFormDialog';
import { SchoolPageHeader } from '@/components/school-portal/SchoolPortalProvider';
import { gradeLevelLabel } from '@/lib/school-registration';
import { sortGrades } from '@/lib/school-grades';
import type { SchoolLesson, SchoolLessonStatus } from '@/lib/school-lessons.server';
import { cn } from '@/lib/utils';

type StatusFilter = 'current' | SchoolLessonStatus | 'all';

const STATUS_LABEL: Record<SchoolLessonStatus, string> = { published: 'Published', draft: 'Draft', archived: 'Archived' };
const STATUS_STYLE: Record<SchoolLessonStatus, string> = {
  published: 'border-green-600/30 bg-green-600/10 text-green-700 dark:text-green-400',
  draft: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  archived: 'border-muted-foreground/30 bg-muted text-muted-foreground',
};

const PAGE_SIZE = 50;

function formatDate(value: string | null) {
  if (!value) return '';
  return new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function StatusBadge({ status }: { status: SchoolLessonStatus }) {
  return <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-xs font-medium', STATUS_STYLE[status])}>{STATUS_LABEL[status]}</span>;
}

function LessonsPage() {
  const params = useSearchParams();
  const { toast } = useToast();
  const lessons = useHomeworkData<{ lessons: SchoolLesson[] }>('/api/schools/current/lessons');
  const [query, setQuery] = useState('');
  const [teacher, setTeacher] = useState(params.get('teacher') ?? 'all');
  const [grade, setGrade] = useState(params.get('grade') ?? 'all');
  const [status, setStatus] = useState<StatusFilter>('current');
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);

  const list = lessons.data?.lessons ?? [];
  const teachers = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of list) if (l.teacher) map.set(l.teacher.userId, l.teacher.name);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [list]);
  const grades = useMemo(() => sortGrades(list.map((l) => l.gradeLevel).filter((g): g is string => Boolean(g))), [list]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list.filter((l) => {
      if (status === 'current' && l.status === 'archived') return false;
      if (status !== 'current' && status !== 'all' && l.status !== status) return false;
      if (teacher === 'none' ? l.teacher : teacher !== 'all' && l.teacher?.userId !== teacher) return false;
      if (grade !== 'all' && l.gradeLevel !== grade) return false;
      if (q && !`${l.title} ${l.subject} ${l.teacher?.name ?? ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [list, query, teacher, grade, status]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const counts = {
    published: list.filter((l) => l.status === 'published').length,
    draft: list.filter((l) => l.status === 'draft').length,
    archived: list.filter((l) => l.status === 'archived').length,
  };

  const setArchived = async (lesson: SchoolLesson, archived: boolean) => {
    setBusy(lesson.id);
    try {
      await axios.patch(`/api/schools/current/lessons/${lesson.id}`, { archived });
      toast({ title: archived ? `Archived “${lesson.title}”` : `Restored “${lesson.title}”`, description: archived ? 'Students no longer see it.' : undefined });
      lessons.refresh();
    } catch (err) {
      toast({ title: 'Could not update the lesson', description: (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Please try again.', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const action = (l: SchoolLesson) => (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setArchived(l, l.status !== 'archived')}
      disabled={busy === l.id}
      aria-label={l.status === 'archived' ? `Restore ${l.title}` : `Archive ${l.title}`}
    >
      {busy === l.id ? <Loader2 className="h-4 w-4 animate-spin" /> : l.status === 'archived' ? <><ArchiveRestore className="mr-1 h-4 w-4" />Restore</> : <><Archive className="mr-1 h-4 w-4" />Archive</>}
    </Button>
  );

  const reset = (fn: () => void) => { fn(); setPage(0); };

  return (
    <div>
      <SchoolPageHeader
        title="Lessons"
        description={lessons.data
          ? `${counts.published} published, ${counts.draft} in draft and ${counts.archived} archived across the school.`
          : 'Every lesson your teachers have made.'}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Label htmlFor="lesson-search" className="sr-only">Search lessons</Label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input id="lesson-search" className="pl-9" placeholder="Search title, subject or teacher" value={query} onChange={(e) => reset(() => setQuery(e.target.value))} />
        </div>
        <select aria-label="Teacher" className={NATIVE_SELECT_CLASS} value={teacher} onChange={(e) => reset(() => setTeacher(e.target.value))}>
          <option value="all">All teachers</option>
          {teachers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          <option value="none">No teacher</option>
        </select>
        <select aria-label="Grade" className={NATIVE_SELECT_CLASS} value={grade} onChange={(e) => reset(() => setGrade(e.target.value))}>
          <option value="all">All grades</option>
          {grades.map((g) => <option key={g} value={g}>{gradeLevelLabel(g)}</option>)}
          {grade !== 'all' && !grades.includes(grade) && <option value={grade}>{gradeLevelLabel(grade)}</option>}
        </select>
        <select aria-label="Status" className={NATIVE_SELECT_CLASS} value={status} onChange={(e) => reset(() => setStatus(e.target.value as StatusFilter))}>
          <option value="current">Published and drafts</option>
          <option value="published">Published</option>
          <option value="draft">Drafts</option>
          <option value="archived">Archived</option>
          <option value="all">Everything</option>
        </select>
      </div>

      {lessons.error ? (
        <div className="rounded-lg border p-6 text-sm">
          <p className="text-destructive">{lessons.error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={lessons.refresh}>Try again</Button>
        </div>
      ) : lessons.loading && !lessons.data ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" aria-label="Loading" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm">
          <p className="font-medium">{list.length === 0 ? 'No lessons yet.' : 'No lessons match these filters.'}</p>
          {list.length === 0 && <p className="mt-1 text-muted-foreground">Lessons your teachers create will show up here.</p>}
        </div>
      ) : (
        <>
          <ul className="space-y-2 md:hidden">
            {visible.map((l) => (
              <li key={l.id} className={cn('rounded-lg border p-3 text-sm', l.status === 'archived' && 'text-muted-foreground')}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-words font-medium text-foreground">{l.title}</p>
                    <p className="text-muted-foreground">{[l.subject, l.gradeLevel ? gradeLevelLabel(l.gradeLevel) : null].filter(Boolean).join(' · ')}</p>
                  </div>
                  <StatusBadge status={l.status} />
                </div>
                <p className="mt-2 text-muted-foreground">{l.teacher?.name ?? 'No teacher'} · {l.studentsStarted} started · {l.homeworkSet} homework</p>
                <div className="mt-1 flex justify-end">{action(l)}</div>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto rounded-lg border md:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Lesson</th>
                  <th className="px-3 py-2 font-medium">Teacher</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 text-right font-medium">Students started</th>
                  <th className="px-3 py-2 text-right font-medium">Homework</th>
                  <th className="px-3 py-2 font-medium">Updated</th>
                  <th className="w-28 px-3 py-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {visible.map((l) => (
                  <tr key={l.id} className={cn(l.status === 'archived' && 'text-muted-foreground')}>
                    <td className="max-w-sm px-3 py-2">
                      <div className="break-words font-medium text-foreground">{l.title}</div>
                      <div className="text-muted-foreground">{[l.subject, l.gradeLevel ? gradeLevelLabel(l.gradeLevel) : null].filter(Boolean).join(' · ')}</div>
                    </td>
                    <td className="px-3 py-2">{l.teacher?.name ?? <span className="text-muted-foreground">No teacher</span>}</td>
                    <td className="px-3 py-2">
                      <StatusBadge status={l.status} />
                      {l.version && <div className="mt-1 text-xs text-muted-foreground">Version {l.version}, {formatDate(l.publishedAt)}</div>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{l.studentsStarted}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{l.homeworkSet}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{formatDate(l.updatedAt)}</td>
                    <td className="px-3 py-2 text-right">{action(l)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Page {page + 1} of {pages} · {filtered.length} lessons</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage((p) => p - 1)} disabled={page === 0}>Previous</Button>
                <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page + 1 >= pages}>Next</Button>
              </div>
            </div>
          )}
          <p className="mt-4 text-xs text-muted-foreground">Archiving hides a lesson from students. Its homework and results are kept, and you can restore it any time.</p>
        </>
      )}
    </div>
  );
}

export default function SchoolLessonsPage() {
  return (
    <Suspense fallback={null}>
      <LessonsPage />
    </Suspense>
  );
}
