import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { readAll } from "@/lib/homework/read-all";
import { netUsageByKind, monthStartUtc } from "@/lib/school-billing";
import type {
  InsightAttempt,
  InsightGrade,
  InsightHomework,
  InsightRecipient,
} from "@/lib/dashboard-insights";
import {
  latestActivity,
  rosterRows,
  studentHomework,
  studentObjectives,
  type RosterRow,
  type RosterStudent,
  type StudentHomeworkRow,
  type StudentObjectiveRow,
} from "@/lib/teacher-students";

// Service-role queries, scoped by hand to the teacher's school and homework.

type DB = SupabaseClient;

const ACTIVITY_DAYS = 90;

export class StudentAccessError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Active students in the school, with their grade. */
async function schoolStudents(db: DB, schoolId: string, onlyIds?: string[]): Promise<RosterStudent[]> {
  const members = await readAll((from, to) => {
    let q = db
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", schoolId)
      .eq("is_active", true);
    if (onlyIds) q = q.in("user_id", onlyIds);
    return q.order("user_id").range(from, to);
  }, 5000);
  const ids = members.map((m) => m.user_id as string);
  const students: RosterStudent[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    const batch = ids.slice(i, i + 150);
    const [users, grades] = await Promise.all([
      db.from("users").select("id,name,email").in("id", batch).eq("role", "student"),
      db.from("students").select("user_id,grade").in("user_id", batch),
    ]);
    if (users.error) throw users.error;
    if (grades.error) throw grades.error;
    const gradeOf = new Map((grades.data ?? []).map((s) => [s.user_id as string, (s.grade as string | null) ?? null]));
    for (const u of users.data ?? [])
      students.push({ id: u.id, name: u.name || u.email || "Student", grade: gradeOf.get(u.id) ?? null });
  }
  return students;
}

/** The teacher's homework that students have seen, with recipients, attempts and grades for these students. */
async function homeworkFor(db: DB, teacherId: string, schoolId: string, studentIds: string[]) {
  const homeworks = (
    await readAll((from, to) =>
      db
        .from("homeworks")
        .select("id,title,due_at,close_at,questions,objectives,organization_id")
        .eq("owner_id", teacherId)
        .eq("organization_id", schoolId)
        .in("status", ["published", "archived"])
        .not("published_at", "is", null)
        .order("id")
        .range(from, to),
    )
  ) as InsightHomework[];
  let recipients: InsightRecipient[] = [],
    attempts: InsightAttempt[] = [],
    grades: InsightGrade[] = [];
  const ids = homeworks.map((h) => h.id);
  for (let i = 0; i < ids.length && studentIds.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const forStudents = studentIds.length <= 150 ? studentIds : null;
    const [r, a, g] = await Promise.all([
      readAll((from, to) => {
        let q = db.from("homework_recipients").select("homework_id,student_id,extension_at").in("homework_id", batch);
        if (forStudents) q = q.in("student_id", forStudents);
        return q.order("homework_id").order("student_id").range(from, to);
      }),
      readAll((from, to) => {
        let q = db
          .from("homework_attempts")
          .select("id,homework_id,student_id,attempt_number,submitted_at,late,revision_due_at")
          .in("homework_id", batch);
        if (forStudents) q = q.in("student_id", forStudents);
        return q.order("id").range(from, to);
      }),
      readAll((from, to) => {
        let q = db
          .from("homework_grades")
          .select("attempt_id,marks,released_at,released_marks,homework_attempts!inner(homework_id,student_id)")
          .in("homework_attempts.homework_id", batch);
        if (forStudents) q = q.in("homework_attempts.student_id", forStudents);
        return q.order("attempt_id").range(from, to);
      }),
    ]);
    recipients = recipients.concat(r as InsightRecipient[]);
    attempts = attempts.concat(a as InsightAttempt[]);
    grades = grades.concat(g as unknown as InsightGrade[]);
  }
  return { homeworks, recipients, attempts, grades };
}

async function lastActive(db: DB, studentIds: string[], attempts: InsightAttempt[], now: Date) {
  const since = new Date(now.getTime() - ACTIVITY_DAYS * 86400000).toISOString();
  const rows: { student_id: string; at: string | null }[] = attempts.map((a) => ({
    student_id: a.student_id,
    at: a.submitted_at,
  }));
  for (let i = 0; i < studentIds.length; i += 150) {
    const batch = studentIds.slice(i, i + 150);
    const [runs, sessions] = await Promise.all([
      db.from("learning_runs").select("student_id,updated_at").in("student_id", batch).gte("updated_at", since).limit(5000),
      db.from("learning_sessions").select("user_id,updated_at").in("user_id", batch).gte("updated_at", since).limit(5000),
    ]);
    if (runs.error) throw runs.error;
    if (sessions.error) throw sessions.error;
    for (const r of runs.data ?? []) rows.push({ student_id: r.student_id, at: r.updated_at });
    for (const s of sessions.data ?? []) rows.push({ student_id: s.user_id, at: s.updated_at });
  }
  return latestActivity(rows);
}

export interface TeacherRoster {
  students: RosterRow[];
  /** Grades the teacher teaches, used as the default filter. */
  teacherGrades: string[];
}

export async function teacherRoster(db: DB, teacherId: string, schoolId: string, now = new Date()): Promise<TeacherRoster> {
  const [students, teacher] = await Promise.all([
    schoolStudents(db, schoolId),
    db.from("teachers").select("grades").eq("user_id", teacherId).maybeSingle(),
  ]);
  if (teacher.error) throw teacher.error;
  const ids = students.map((s) => s.id);
  const work = await homeworkFor(db, teacherId, schoolId, ids);
  const active = await lastActive(db, ids, work.attempts, now);
  return {
    students: rosterRows({ students, ...work, lastActive: active, now }),
    teacherGrades: ((teacher.data?.grades as string[] | null) ?? []).map((g) => g.trim().toLowerCase()),
  };
}

export interface TeacherStudentDetail {
  student: RosterStudent & { email: string | null; lastActive: string | null };
  homework: StudentHomeworkRow[];
  objectives: StudentObjectiveRow[];
  tutorMinutesThisMonth: number;
}

export async function teacherStudentDetail(
  db: DB,
  teacherId: string,
  schoolId: string,
  studentId: string,
  now = new Date(),
): Promise<TeacherStudentDetail> {
  const [student] = await schoolStudents(db, schoolId, [studentId]);
  if (!student) throw new StudentAccessError(404, "This student isn't in your school.");
  const [{ data: user }, work] = await Promise.all([
    db.from("users").select("email").eq("id", studentId).maybeSingle(),
    homeworkFor(db, teacherId, schoolId, [studentId]),
  ]);
  const [active, usage] = await Promise.all([
    lastActive(db, [studentId], work.attempts, now),
    db
      .from("organization_credit_transactions")
      .select("transaction_type,usage_kind,credits")
      .eq("organization_id", schoolId)
      .eq("user_id", studentId)
      .gte("created_at", monthStartUtc(now).toISOString())
      .limit(5000),
  ]);
  if (usage.error) throw usage.error;
  return {
    student: { ...student, email: (user?.email as string | null) ?? null, lastActive: active.get(studentId) ?? null },
    homework: studentHomework({ studentId, ...work, now }),
    objectives: studentObjectives({ studentId, ...work }),
    tutorMinutesThisMonth: netUsageByKind(usage.data ?? []).voice,
  };
}
