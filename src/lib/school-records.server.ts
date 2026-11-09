import 'server-only';
import type { NextResponse } from 'next/server';
import { notify, type NewNotification } from '@/lib/notifications.server';
import { isSchoolManager, requireSchoolRole, type SchoolRecord, type ServiceSupabase } from '@/lib/school-access.server';
import { dayKey, dayStart } from '@/lib/school-reports';
import {
  ATTENDANCE_STATUSES,
  emptyAttendance,
  isDay,
  shiftDay,
  subjectResults,
  type AttendanceStatus,
  type AttendanceTotals,
  type MarkItem,
  type RecordsClass,
  type Register,
  type ReportCard,
  type ReportSnapshot,
} from '@/lib/school-records';

/** Rows per request, and ids per `in (...)` filter (they travel in the URL). */
const PAGE = 1000;
const IDS = 100;

export class RecordsError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export type RecordsActor = {
  userId: string;
  supabase: ServiceSupabase;
  school: SchoolRecord;
  role: string;
  manager: boolean;
};

/** The signed-in school member behind a records request, or the error response to return. */
export async function requireRecordsActor(
  roles: readonly string[] = ['owner', 'admin', 'teacher'],
): Promise<{ ok: true; actor: RecordsActor } | { ok: false; response: NextResponse }> {
  const guard = await requireSchoolRole(roles);
  if (!guard.ok) return guard;
  const { userId, supabase, membership } = guard.context;
  return { ok: true, actor: { userId, supabase, school: membership.school, role: membership.role, manager: isSchoolManager(membership.role) } };
}

const chunked = <T,>(items: readonly T[], size = IDS): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

/** Reads every page of a query. `page` must apply a stable order. */
async function readPages<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>, max = 50_000): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < max; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE) break;
  }
  return rows;
}

export const todayAtSchool = (school: Pick<SchoolRecord, 'timezone'>, now: Date = new Date()) => dayKey(now, school.timezone);

// ---------------------------------------------------------------------------
// Classes and rosters
// ---------------------------------------------------------------------------

/** Classes the person keeps records for: every class for managers, their own for teachers. */
export async function recordsClasses(actor: RecordsActor): Promise<RecordsClass[]> {
  const { supabase, school } = actor;
  let ids: string[] | null = null;
  if (!actor.manager) {
    const { data, error } = await supabase.from('school_class_teachers').select('class_id').eq('organization_id', school.id).eq('teacher_id', actor.userId).limit(PAGE);
    if (error) throw error;
    ids = (data ?? []).map((row) => row.class_id as string);
    if (ids.length === 0) return [];
  }
  let query = supabase.from('school_classes').select('id, name, grade').eq('organization_id', school.id).order('grade').order('name').limit(PAGE);
  if (ids) query = query.in('id', ids.slice(0, IDS));
  const { data: classes, error } = await query;
  if (error) throw error;
  const counts = new Map<string, number>();
  for (const part of chunked((classes ?? []).map((c) => c.id as string))) {
    const links = await readPages<{ class_id: string }>((from, to) =>
      supabase.from('school_class_students').select('class_id').in('class_id', part).order('class_id').order('student_id').range(from, to),
    );
    for (const link of links) counts.set(link.class_id, (counts.get(link.class_id) ?? 0) + 1);
  }
  return (classes ?? []).map((c) => ({ id: c.id as string, name: c.name as string, grade: c.grade as string, studentCount: counts.get(c.id as string) ?? 0 }));
}

export type ClassInfo = { id: string; name: string; grade: string };

/** The class, after checking it belongs to the school and that the person may keep its records. */
export async function requireClass(actor: RecordsActor, classId: unknown): Promise<ClassInfo> {
  if (typeof classId !== 'string' || !/^[0-9a-f-]{36}$/i.test(classId)) throw new RecordsError('Pick a class');
  const { supabase, school } = actor;
  const { data, error } = await supabase.from('school_classes').select('id, name, grade').eq('id', classId).eq('organization_id', school.id).maybeSingle();
  if (error) throw error;
  if (!data) throw new RecordsError('Class not found', 404);
  if (!actor.manager) {
    const { data: teaches, error: teachError } = await supabase.from('school_class_teachers').select('class_id').eq('class_id', classId).eq('teacher_id', actor.userId).maybeSingle();
    if (teachError) throw teachError;
    if (!teaches) throw new RecordsError('You can only keep records for classes you teach', 403);
  }
  return { id: data.id as string, name: data.name as string, grade: data.grade as string };
}

/** Active students in the class, by name. */
export async function classRoster(supabase: ServiceSupabase, schoolId: string, classId: string): Promise<{ studentId: string; name: string }[]> {
  const { data: links, error } = await supabase.from('school_class_students').select('student_id').eq('class_id', classId).limit(PAGE);
  if (error) throw error;
  const roster: { studentId: string; name: string }[] = [];
  for (const part of chunked((links ?? []).map((row) => row.student_id as string))) {
    const [members, users] = await Promise.all([
      supabase.from('organization_members').select('user_id').eq('organization_id', schoolId).eq('role', 'student').eq('is_active', true).in('user_id', part),
      supabase.from('users').select('id, name, email').in('id', part),
    ]);
    if (members.error) throw members.error;
    if (users.error) throw users.error;
    const active = new Set((members.data ?? []).map((row) => row.user_id as string));
    for (const user of users.data ?? []) {
      if (active.has(user.id as string)) roster.push({ studentId: user.id as string, name: (user.name as string | null)?.trim() || (user.email as string | null) || 'Student' });
    }
  }
  return roster.sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

/** A day a register may be kept for: a real date, not in the future, not more than a year back. */
export function requireRegisterDay(day: unknown, school: Pick<SchoolRecord, 'timezone'>, now: Date = new Date()): string {
  if (!isDay(day)) throw new RecordsError('Pick a date');
  const today = todayAtSchool(school, now);
  if (day > today) throw new RecordsError('You can’t take attendance for a day that hasn’t happened yet');
  if (day < dayKey(new Date(now.getTime() - 366 * 24 * 60 * 60 * 1000), school.timezone)) throw new RecordsError('That date is too far back');
  return day;
}

export async function getRegister(supabase: ServiceSupabase, schoolId: string, classId: string, day: string): Promise<Register> {
  const [roster, marks] = await Promise.all([
    classRoster(supabase, schoolId, classId),
    supabase.from('attendance_records').select('student_id, status, note').eq('class_id', classId).eq('day', day).limit(PAGE),
  ]);
  if (marks.error) throw marks.error;
  const byStudent = new Map((marks.data ?? []).map((row) => [row.student_id as string, row]));
  const rows = roster.map((student) => {
    const mark = byStudent.get(student.studentId);
    return { ...student, status: (mark?.status as AttendanceStatus | undefined) ?? null, note: (mark?.note as string | null) ?? '' };
  });
  return { classId, day, rows, markedCount: rows.filter((row) => row.status).length };
}

export type RegisterEntry = { studentId: string; status: AttendanceStatus; note?: string | null };

/** Saves the day's marks for students in the class. Entries for anyone else are refused. */
export async function saveRegister(actor: RecordsActor, classId: string, day: string, entries: RegisterEntry[]): Promise<number> {
  const { supabase, school } = actor;
  const roster = new Set((await classRoster(supabase, school.id, classId)).map((student) => student.studentId));
  const seen = new Set<string>();
  const rows = entries.map((entry) => {
    if (!roster.has(entry.studentId)) throw new RecordsError('Someone on that list is not in this class');
    if (!(ATTENDANCE_STATUSES as readonly string[]).includes(entry.status)) throw new RecordsError('Unknown attendance mark');
    if (seen.has(entry.studentId)) throw new RecordsError('A student appears twice');
    seen.add(entry.studentId);
    return {
      organization_id: school.id,
      class_id: classId,
      student_id: entry.studentId,
      day,
      status: entry.status,
      note: entry.note?.trim().slice(0, 300) || null,
      marked_by: actor.userId,
      updated_at: new Date().toISOString(),
    };
  });
  if (rows.length === 0) return 0;
  const { error } = await supabase.from('attendance_records').upsert(rows, { onConflict: 'class_id,student_id,day' });
  if (error) throw error;
  return rows.length;
}

/** Attendance totals per student between two days (inclusive). One mark per student per day counts. */
export async function attendanceTotals(supabase: ServiceSupabase, schoolId: string, studentIds: string[], from: string, to: string): Promise<Map<string, AttendanceTotals>> {
  const totals = new Map<string, AttendanceTotals>(studentIds.map((id) => [id, emptyAttendance()]));
  for (const part of chunked(studentIds)) {
    const rows = await readPages<{ student_id: string; day: string; status: AttendanceStatus }>((start, end) =>
      supabase
        .from('attendance_records')
        .select('student_id, day, status')
        .eq('organization_id', schoolId)
        .in('student_id', part)
        .gte('day', from)
        .lte('day', to)
        .order('student_id')
        .order('day')
        .order('id')
        .range(start, end),
    );
    const counted = new Set<string>();
    for (const row of rows) {
      const key = `${row.student_id}:${row.day}`;
      const total = totals.get(row.student_id);
      if (!total || counted.has(key) || !(row.status in total)) continue;
      counted.add(key);
      total[row.status] += 1;
      total.days += 1;
    }
  }
  return totals;
}

// ---------------------------------------------------------------------------
// Marks
// ---------------------------------------------------------------------------

/**
 * Released homework marks and handed-in assessment scores for the students,
 * from work set by this school, dated between `from` and `to` (inclusive days).
 */
export async function studentMarks(supabase: ServiceSupabase, school: Pick<SchoolRecord, 'id' | 'timezone'>, studentIds: string[], from: string, to: string): Promise<MarkItem[]> {
  const schoolId = school.id;
  // Days are the school's own: from the start of `from` to the start of the day after `to`.
  const start = dayStart(from, school.timezone);
  const end = dayStart(shiftDay(to, 1), school.timezone);
  const marks: MarkItem[] = [];

  for (const part of chunked(studentIds)) {
    // Homework: the latest released attempt for each piece of work.
    const attempts = await readPages<{ id: string; homework_id: string; student_id: string; attempt_number: number }>((a, b) =>
      supabase.from('homework_attempts').select('id, homework_id, student_id, attempt_number').in('student_id', part).not('submitted_at', 'is', null).order('id').range(a, b),
    );
    const homeworks = new Map<string, { title: string; subject: string; possible: number }>();
    for (const ids of chunked([...new Set(attempts.map((row) => row.homework_id))])) {
      const { data, error } = await supabase.from('homeworks').select('id, title, subject, questions, organization_id').eq('organization_id', schoolId).in('id', ids);
      if (error) throw error;
      for (const row of data ?? []) {
        const questions = (Array.isArray(row.questions) ? row.questions : []) as { points?: number }[];
        homeworks.set(row.id as string, { title: row.title as string, subject: (row.subject as string | null) ?? '', possible: questions.reduce((n, q) => n + (Number(q.points) || 0), 0) });
      }
    }
    const mine = attempts.filter((row) => homeworks.has(row.homework_id));
    const attemptOf = new Map(mine.map((row) => [row.id, row]));
    const latest = new Map<string, { attempt: number; item: MarkItem }>();
    for (const ids of chunked(mine.map((row) => row.id))) {
      const { data, error } = await supabase.from('homework_grades').select('attempt_id, released_marks, released_at').in('attempt_id', ids).gte('released_at', start).lt('released_at', end);
      if (error) throw error;
      for (const grade of data ?? []) {
        const attempt = attemptOf.get(grade.attempt_id as string);
        const homework = attempt && homeworks.get(attempt.homework_id);
        if (!attempt || !homework || !grade.released_marks) continue;
        const earned = Object.values(grade.released_marks as Record<string, { score?: number }>).reduce((n, m) => n + (Number(m?.score) || 0), 0);
        const key = `${attempt.student_id}:${attempt.homework_id}`;
        const known = latest.get(key);
        if (known && known.attempt > attempt.attempt_number) continue;
        latest.set(key, {
          attempt: attempt.attempt_number,
          item: { studentId: attempt.student_id, kind: 'homework', itemId: attempt.homework_id, title: homework.title, subject: homework.subject, at: grade.released_at as string, earned, possible: homework.possible },
        });
      }
    }
    for (const { item } of latest.values()) if (item.possible > 0) marks.push(item);

    // Assessments: the score from each one handed in.
    const results = await readPages<{ assessment_id: string; student_id: string; score: number | null; percentage: number | string | null; submittedat: string }>((a, b) =>
      supabase
        .from('assessment_results')
        .select('assessment_id, student_id, score, percentage, submittedat')
        .in('student_id', part)
        .gte('submittedat', start)
        .lt('submittedat', end)
        .order('id')
        .range(a, b),
    );
    const assessments = new Map<string, { title: string; subject: string; total: number }>();
    for (const ids of chunked([...new Set(results.map((row) => row.assessment_id))])) {
      const { data, error } = await supabase.from('assessments').select('id, title, subject, totalpoints').eq('organization_id', schoolId).in('id', ids);
      if (error) throw error;
      for (const row of data ?? []) assessments.set(row.id as string, { title: row.title as string, subject: (row.subject as string | null) ?? '', total: Number(row.totalpoints) || 0 });
    }
    for (const result of results) {
      const assessment = assessments.get(result.assessment_id);
      if (!assessment) continue;
      const share = result.percentage !== null && result.percentage !== undefined ? Number(result.percentage) : null;
      const possible = assessment.total > 0 ? assessment.total : 100;
      const earned = result.score !== null && assessment.total > 0 ? Number(result.score) : share !== null && Number.isFinite(share) ? (share / 100) * possible : null;
      if (earned === null) continue;
      marks.push({ studentId: result.student_id, kind: 'assessment', itemId: result.assessment_id, title: assessment.title, subject: assessment.subject, at: result.submittedat, earned: Math.min(earned, possible), possible });
    }
  }
  return marks;
}

// ---------------------------------------------------------------------------
// Report cards
// ---------------------------------------------------------------------------

type ReportRow = {
  id: string;
  student_id: string;
  class_id: string | null;
  term: string;
  period_start: string;
  period_end: string;
  snapshot: ReportSnapshot;
  comment: string;
  published_at: string | null;
  updated_at: string;
};

const REPORT_FIELDS = 'id, student_id, class_id, term, period_start, period_end, snapshot, comment, published_at, updated_at';

const toCard = (row: ReportRow): ReportCard => ({
  id: row.id,
  studentId: row.student_id,
  classId: row.class_id,
  term: row.term,
  periodStart: row.period_start,
  periodEnd: row.period_end,
  snapshot: row.snapshot,
  comment: row.comment,
  publishedAt: row.published_at,
  updatedAt: row.updated_at,
});

export type ReportPeriod = { term: string; periodStart: string; periodEnd: string };

export function requireReportPeriod(input: { term?: unknown; periodStart?: unknown; periodEnd?: unknown }): ReportPeriod {
  const term = typeof input.term === 'string' ? input.term.replace(/\s+/g, ' ').trim() : '';
  if (!term || term.length > 60) throw new RecordsError('Give the term a name, up to 60 characters');
  if (!isDay(input.periodStart) || !isDay(input.periodEnd)) throw new RecordsError('Pick the first and last day of the term');
  if (input.periodEnd < input.periodStart) throw new RecordsError('The last day must come after the first');
  if (Date.parse(input.periodEnd) - Date.parse(input.periodStart) > 370 * 24 * 60 * 60 * 1000) throw new RecordsError('A term can cover a year at most');
  return { term, periodStart: input.periodStart, periodEnd: input.periodEnd };
}

/**
 * Makes (or refreshes) a report card for every student in the class. Marks and
 * attendance are worked out again; comments already written are kept, and so
 * is each card's published state.
 */
export async function generateReportCards(actor: RecordsActor, klass: ClassInfo, period: ReportPeriod): Promise<ReportCard[]> {
  const { supabase, school } = actor;
  const roster = await classRoster(supabase, school.id, klass.id);
  if (roster.length === 0) throw new RecordsError('This class has no students yet');
  const ids = roster.map((student) => student.studentId);
  const [marks, attendance] = await Promise.all([
    studentMarks(supabase, school, ids, period.periodStart, period.periodEnd),
    attendanceTotals(supabase, school.id, ids, period.periodStart, period.periodEnd),
  ]);
  const now = new Date().toISOString();
  const rows = roster.map((student) => {
    const own = marks.filter((mark) => mark.studentId === student.studentId);
    const snapshot: ReportSnapshot = {
      ...subjectResults(own),
      attendance: attendance.get(student.studentId) ?? emptyAttendance(),
      studentName: student.name,
      className: klass.name,
      grade: klass.grade,
      schoolName: school.name,
    };
    return {
      organization_id: school.id,
      student_id: student.studentId,
      class_id: klass.id,
      term: period.term,
      period_start: period.periodStart,
      period_end: period.periodEnd,
      snapshot,
      created_by: actor.userId,
      updated_at: now,
    };
  });
  // comment and published_at are left out, so existing ones survive the upsert.
  const { error } = await supabase.from('report_cards').upsert(rows, { onConflict: 'organization_id,student_id,term' });
  if (error) throw error;
  return listClassReportCards(supabase, school.id, klass.id, period.term);
}

export async function listClassReportCards(supabase: ServiceSupabase, schoolId: string, classId: string, term?: string): Promise<ReportCard[]> {
  let query = supabase.from('report_cards').select(REPORT_FIELDS).eq('organization_id', schoolId).eq('class_id', classId).order('period_end', { ascending: false }).limit(PAGE);
  if (term) query = query.eq('term', term);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as ReportRow[]).map(toCard).sort((a, b) => a.snapshot.studentName.localeCompare(b.snapshot.studentName));
}

/** The terms that already have report cards for the class, newest first. */
export function reportTerms(cards: ReportCard[]): ReportPeriod[] {
  const seen = new Map<string, ReportPeriod>();
  for (const card of cards) if (!seen.has(card.term)) seen.set(card.term, { term: card.term, periodStart: card.periodStart, periodEnd: card.periodEnd });
  return [...seen.values()].sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));
}

async function loadCard(supabase: ServiceSupabase, schoolId: string, id: string): Promise<ReportRow> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new RecordsError('Report card not found', 404);
  const { data, error } = await supabase.from('report_cards').select(REPORT_FIELDS).eq('id', id).eq('organization_id', schoolId).maybeSingle();
  if (error) throw error;
  if (!data) throw new RecordsError('Report card not found', 404);
  return data as ReportRow;
}

/** A card the staff member may edit: any in the school for managers, their classes' for teachers. */
async function requireEditableCard(actor: RecordsActor, id: string): Promise<ReportRow> {
  const row = await loadCard(actor.supabase, actor.school.id, id);
  if (!actor.manager) {
    if (!row.class_id) throw new RecordsError('Only school administrators can change this report card', 403);
    await requireClass(actor, row.class_id);
  }
  return row;
}

/** Tells each student, and the parents who follow them, that a report card was shared. Never throws. */
async function announceReportCards(supabase: ServiceSupabase, schoolId: string, cards: { id: string; studentId: string; term: string; studentName: string }[]): Promise<void> {
  try {
    if (cards.length === 0) return;
    const rows: NewNotification[] = cards.map((card) => ({ userId: card.studentId, kind: 'report_card', title: `Your ${card.term} report card is ready`, href: `/students/report-cards/${card.id}` }));
    const byStudent = new Map(cards.map((card) => [card.studentId, card]));
    for (const part of chunked([...byStudent.keys()])) {
      const { data, error } = await supabase.from('student_guardians').select('student_id, guardian_id').eq('organization_id', schoolId).in('student_id', part);
      if (error) throw error;
      for (const link of data ?? []) {
        const card = byStudent.get(link.student_id as string);
        if (card) rows.push({ userId: link.guardian_id as string, kind: 'report_card', title: `${card.studentName}’s ${card.term} report card is ready`, href: `/parents/report-cards/${card.id}` });
      }
    }
    await notify(rows, supabase);
  } catch (error) {
    console.error('[report cards] notification failed:', error);
  }
}

export async function updateReportCard(actor: RecordsActor, id: string, change: { comment?: string; published?: boolean }): Promise<ReportCard> {
  const row = await requireEditableCard(actor, id);
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof change.comment === 'string') patch.comment = change.comment.trim().slice(0, 2000);
  const publishing = change.published === true && !row.published_at;
  if (publishing) patch.published_at = new Date().toISOString();
  if (change.published === false) patch.published_at = null;
  const { data, error } = await actor.supabase.from('report_cards').update(patch).eq('id', id).eq('organization_id', actor.school.id).select(REPORT_FIELDS).single();
  if (error) throw error;
  if (publishing) await announceReportCards(actor.supabase, actor.school.id, [{ id: row.id, studentId: row.student_id, term: row.term, studentName: row.snapshot.studentName }]);
  return toCard(data as ReportRow);
}

/** Publishes every unpublished card for the class and term, and tells each student. */
export async function publishClassReportCards(actor: RecordsActor, classId: string, term: string): Promise<number> {
  const { supabase, school } = actor;
  const { data, error } = await supabase
    .from('report_cards')
    .update({ published_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('organization_id', school.id)
    .eq('class_id', classId)
    .eq('term', term)
    .is('published_at', null)
    .select('id, student_id, term, snapshot');
  if (error) throw error;
  await announceReportCards(
    supabase,
    school.id,
    (data ?? []).map((row) => ({ id: row.id as string, studentId: row.student_id as string, term: row.term as string, studentName: (row.snapshot as ReportSnapshot).studentName })),
  );
  return (data ?? []).length;
}

/** A card for someone to read: staff as above; a student only their own, once published. */
export async function readReportCard(viewer: { userId: string; supabase: ServiceSupabase; school: SchoolRecord; role: string }, id: string): Promise<ReportCard> {
  if (viewer.role === 'student') {
    const row = await loadCard(viewer.supabase, viewer.school.id, id);
    if (row.student_id !== viewer.userId || !row.published_at) throw new RecordsError('Report card not found', 404);
    return toCard(row);
  }
  return toCard(await requireEditableCard({ ...viewer, manager: isSchoolManager(viewer.role) }, id));
}

/** A student's published report cards, newest first. */
export async function studentReportCards(supabase: ServiceSupabase, schoolId: string, studentId: string): Promise<ReportCard[]> {
  const { data, error } = await supabase
    .from('report_cards')
    .select(REPORT_FIELDS)
    .eq('organization_id', schoolId)
    .eq('student_id', studentId)
    .not('published_at', 'is', null)
    .order('period_end', { ascending: false })
    .limit(50);
  if (error) throw error;
  return ((data ?? []) as ReportRow[]).map(toCard);
}

export function recordsErrorResponse(error: unknown, fallback: string, where: string): { body: { error: string }; status: number } {
  if (error instanceof RecordsError) return { body: { error: error.message }, status: error.status };
  console.error(`[${where}]`, error);
  return { body: { error: fallback }, status: 500 };
}
