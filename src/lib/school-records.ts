/** Shapes and small helpers shared by attendance, the gradebook and report cards. */

export const ATTENDANCE_STATUSES = ['present', 'late', 'absent', 'excused'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  present: 'Present',
  late: 'Late',
  absent: 'Absent',
  excused: 'Excused',
};

export type RecordsClass = { id: string; name: string; grade: string; studentCount: number };

export type RegisterRow = { studentId: string; name: string; status: AttendanceStatus | null; note: string };
export type Register = { classId: string; day: string; rows: RegisterRow[]; markedCount: number };

export type AttendanceTotals = Record<AttendanceStatus, number> & { days: number };

export const emptyAttendance = (): AttendanceTotals => ({ present: 0, late: 0, absent: 0, excused: 0, days: 0 });

/** Share of marked days the student was in class (present or late), 0-100, or null with nothing marked. */
export function attendanceRate(totals: AttendanceTotals): number | null {
  return totals.days ? Math.round((100 * (totals.present + totals.late)) / totals.days) : null;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar day written YYYY-MM-DD. */
export function isDay(value: unknown): value is string {
  if (typeof value !== 'string' || !DAY.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** The day `days` after (or before, when negative) the given one. */
export function shiftDay(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** "Mon 9 Nov 2026" */
export function dayLabel(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export type MarkKind = 'homework' | 'assessment';

/** One released mark for one student. */
export type MarkItem = {
  studentId: string;
  kind: MarkKind;
  itemId: string;
  title: string;
  subject: string;
  /** When the mark was released (homework) or the work handed in (assessment). */
  at: string;
  earned: number;
  possible: number;
};

export const percent = (earned: number, possible: number): number | null => (possible > 0 ? Math.round((100 * earned) / possible) : null);

export type GradebookColumn = { key: string; kind: MarkKind; title: string; subject: string; at: string; possible: number };
export type GradebookRow = { studentId: string; name: string; cells: Record<string, number | null>; average: number | null; marked: number };
export type Gradebook = { columns: GradebookColumn[]; rows: GradebookRow[]; classAverage: number | null };

/** Turns a flat list of marks into the class grid: one row per student, one column per piece of work. */
export function buildGradebook(students: { studentId: string; name: string }[], marks: MarkItem[]): Gradebook {
  const columns = new Map<string, GradebookColumn>();
  const byStudent = new Map<string, MarkItem[]>();
  for (const mark of marks) {
    const key = `${mark.kind}:${mark.itemId}`;
    const column = columns.get(key);
    if (!column) columns.set(key, { key, kind: mark.kind, title: mark.title, subject: mark.subject, at: mark.at, possible: mark.possible });
    else if (mark.at < column.at) column.at = mark.at;
    byStudent.set(mark.studentId, [...(byStudent.get(mark.studentId) ?? []), mark]);
  }
  let earnedAll = 0;
  let possibleAll = 0;
  const rows = students.map((student) => {
    const own = byStudent.get(student.studentId) ?? [];
    const cells: Record<string, number | null> = {};
    let earned = 0;
    let possible = 0;
    for (const mark of own) {
      cells[`${mark.kind}:${mark.itemId}`] = percent(mark.earned, mark.possible);
      earned += mark.earned;
      possible += mark.possible;
    }
    earnedAll += earned;
    possibleAll += possible;
    return { studentId: student.studentId, name: student.name, cells, average: percent(earned, possible), marked: own.length };
  });
  return {
    columns: [...columns.values()].sort((a, b) => a.at.localeCompare(b.at)),
    rows,
    classAverage: percent(earnedAll, possibleAll),
  };
}

export type SubjectResult = { subject: string; homework: number; assessments: number; percentage: number | null };

export type ReportSnapshot = {
  subjects: SubjectResult[];
  overall: number | null;
  attendance: AttendanceTotals;
  studentName: string;
  className: string | null;
  grade: string | null;
  schoolName: string;
};

/** A student's marks for a period, grouped by subject. */
export function subjectResults(marks: MarkItem[]): { subjects: SubjectResult[]; overall: number | null } {
  const groups = new Map<string, { subject: string; homework: number; assessments: number; earned: number; possible: number }>();
  let earned = 0;
  let possible = 0;
  for (const mark of marks) {
    const name = mark.subject.trim() || 'General';
    const key = name.toLowerCase();
    const group = groups.get(key) ?? { subject: name, homework: 0, assessments: 0, earned: 0, possible: 0 };
    if (mark.kind === 'homework') group.homework += 1;
    else group.assessments += 1;
    group.earned += mark.earned;
    group.possible += mark.possible;
    groups.set(key, group);
    earned += mark.earned;
    possible += mark.possible;
  }
  return {
    subjects: [...groups.values()]
      .sort((a, b) => a.subject.localeCompare(b.subject))
      .map((g) => ({ subject: g.subject, homework: g.homework, assessments: g.assessments, percentage: percent(g.earned, g.possible) })),
    overall: percent(earned, possible),
  };
}

export type ReportCard = {
  id: string;
  studentId: string;
  classId: string | null;
  term: string;
  periodStart: string;
  periodEnd: string;
  snapshot: ReportSnapshot;
  comment: string;
  publishedAt: string | null;
  updatedAt: string;
};

export const REPORT_TERM_MAX = 60;
export const REPORT_COMMENT_MAX = 2000;

/** A cell for a CSV file: quoted, and never read as a formula by a spreadsheet. */
export function csvValue(value: string | number | null): string {
  if (value === null) return '';
  const text = String(value);
  const safe = typeof value === 'string' && /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function gradebookCsv(book: Gradebook): string {
  const head = ['Student', ...book.columns.map((c) => `${c.title} (${c.subject})`), 'Average %'];
  const lines = book.rows.map((row) => [row.name, ...book.columns.map((c) => row.cells[c.key] ?? null), row.average]);
  return [head, ...lines].map((line) => line.map(csvValue).join(',')).join('\r\n');
}
