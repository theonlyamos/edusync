import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { readAll } from "@/lib/homework/read-all";
import { normalizePublishedObjectives } from "@/lib/lesson-artifacts/student-learning";
import { inSameSchool } from "@/lib/school";
import {
  lessonProgress,
  mergeActivity,
  draftsToReview,
  studentsFallingBehind,
  weakestObjectives,
  type ActivityItem,
  type ReviewArtifact,
  type InsightAttempt,
  type InsightGrade,
  type InsightHomework,
  type InsightRecipient,
  type LessonProgress,
  type ObjectiveScore,
  type StudentConcern,
} from "@/lib/dashboard-insights";

// These run with the service-role client, so every query is scoped to the
// signed-in user by hand.

type DB = SupabaseClient;

const ACTIVITY_LIMIT = 8;

export interface ContinueLearningItem {
  runId: string;
  lessonId: string;
  lessonTitle: string;
  subject: string;
  mode: "tutor" | "companion";
  objectiveId: string | null;
  objectiveText: string | null;
  updatedAt: string;
  progress: LessonProgress;
}

export interface StudentDashboardData {
  continueLearning: ContinueLearningItem[];
  objectivesMastered: number;
  activity: ActivityItem[];
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function studentDashboard(
  db: DB,
  userId: string,
  schoolId: string | null,
): Promise<StudentDashboardData> {
  const [runsRes, masteredRes, practiceRes, sessionsRes, feedbackRes, submittedRes] =
    await Promise.all([
      db
        .from("learning_runs")
        .select("id,lesson_id,publication_id,active_objective_id,mode,updated_at")
        .eq("student_id", userId)
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .limit(10),
      db
        .from("learning_events")
        .select("objective_id,lesson_id,created_at")
        .eq("student_id", userId)
        .eq("event_type", "objective_mastered")
        .order("created_at", { ascending: false })
        .limit(1000),
      db
        .from("practice_results")
        .select("id,subject,topic,score,completedat")
        .eq("student_id", userId)
        .order("completedat", { ascending: false })
        .limit(ACTIVITY_LIMIT),
      db
        .from("learning_sessions")
        .select("id,topic,created_at")
        .eq("user_id", userId)
        .is("live_class_event_id", null)
        .or("is_embedded.is.null,is_embedded.eq.false")
        .not("topic", "is", null)
        .order("created_at", { ascending: false })
        .limit(ACTIVITY_LIMIT),
      db
        .from("homework_grades")
        .select(
          "released_at,homework_attempts!inner(student_id,homework_id)",
        )
        .eq("homework_attempts.student_id", userId)
        .not("released_at", "is", null)
        .order("released_at", { ascending: false })
        .limit(ACTIVITY_LIMIT),
      db
        .from("homework_attempts")
        .select("homework_id,submitted_at")
        .eq("student_id", userId)
        .not("submitted_at", "is", null)
        .order("submitted_at", { ascending: false })
        .limit(ACTIVITY_LIMIT),
    ]);
  for (const r of [runsRes, masteredRes, practiceRes, sessionsRes, feedbackRes, submittedRes])
    if (r.error) throw r.error;

  const runs = runsRes.data ?? [],
    mastered = masteredRes.data ?? [];

  // Lessons and objective text for runs and mastery events.
  const lessonIds = [
    ...new Set([
      ...runs.map((r) => r.lesson_id as string),
      ...mastered.slice(0, ACTIVITY_LIMIT).map((e) => e.lesson_id as string),
    ]),
  ];
  const lessonsRes = lessonIds.length
    ? await db
        .from("lessons")
        .select("id,title,subject,organization_id,current_publication_id")
        .in("id", lessonIds)
        .is("archived_at", null)
    : { data: [], error: null };
  if (lessonsRes.error) throw lessonsRes.error;
  // Progress and resume use the lesson's current publication: an older
  // run's objective may no longer exist after a republish.
  const publicationIds = [
    ...new Set(
      (lessonsRes.data ?? [])
        .map((l) => l.current_publication_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const publicationsRes = publicationIds.length
    ? await db.from("lesson_publications").select("id,manifest").in("id", publicationIds)
    : { data: [], error: null };
  if (publicationsRes.error) throw publicationsRes.error;

  const lessons = new Map(
    (lessonsRes.data ?? [])
      .filter((l) => inSameSchool(l.organization_id, schoolId))
      .map((l) => [l.id as string, l]),
  );
  const publishedObjectives = new Map(
    (publicationsRes.data ?? []).map((p) => [
      p.id as string,
      normalizePublishedObjectives(
        (p.manifest as { objectives?: unknown } | null)?.objectives ?? [],
      ) ?? [],
    ]),
  );
  const objectiveText = new Map<string, string>();
  for (const list of publishedObjectives.values())
    for (const o of list) objectiveText.set(o.id, o.text);
  const missingTexts = [
    ...new Set(
      mastered
        .slice(0, ACTIVITY_LIMIT)
        .map((e) => e.objective_id as string | null)
        .filter((id): id is string => Boolean(id) && !objectiveText.has(id!)),
    ),
  ];
  if (missingTexts.length) {
    const { data, error } = await db
      .from("lesson_objectives")
      .select("id,text")
      .in("id", missingTexts);
    if (error) throw error;
    for (const o of data ?? []) objectiveText.set(o.id, o.text);
  }

  const masteredByLesson = new Map<string, Set<string>>();
  for (const e of mastered) {
    if (!e.objective_id) continue;
    const set = masteredByLesson.get(e.lesson_id) ?? new Set<string>();
    set.add(e.objective_id);
    masteredByLesson.set(e.lesson_id, set);
  }

  // One entry per lesson: the most recently used run.
  const seenLessons = new Set<string>();
  const continueLearning: ContinueLearningItem[] = [];
  for (const run of runs) {
    const lesson = lessons.get(run.lesson_id);
    if (!lesson || seenLessons.has(run.lesson_id)) continue;
    seenLessons.add(run.lesson_id);
    if (!lesson.current_publication_id) continue;
    const objectives = publishedObjectives.get(lesson.current_publication_id) ?? [],
      current =
        run.publication_id === lesson.current_publication_id &&
        objectives.some((o) => o.id === run.active_objective_id);
    continueLearning.push({
      runId: run.id,
      lessonId: run.lesson_id,
      lessonTitle: lesson.title,
      subject: lesson.subject,
      mode: run.mode === "companion" ? "companion" : "tutor",
      objectiveId: current ? run.active_objective_id : null,
      objectiveText: current
        ? (objectiveText.get(run.active_objective_id) ?? null)
        : null,
      updatedAt: run.updated_at,
      progress: lessonProgress(
        objectives.map((o) => o.id),
        masteredByLesson.get(run.lesson_id) ?? [],
      ),
    });
    if (continueLearning.length === 3) break;
  }

  // homework_attempts has no direct foreign key to homeworks, so look titles up.
  const feedbackRows = (feedbackRes.data ?? []).flatMap((g) => {
    const attempt = one(
      g.homework_attempts as
        | { homework_id: string }
        | { homework_id: string }[]
        | null,
    );
    return attempt ? [{ at: g.released_at as string, homeworkId: attempt.homework_id }] : [];
  });
  const submittedRows = (submittedRes.data ?? []).map((a) => ({
    at: a.submitted_at as string,
    homeworkId: a.homework_id as string,
  }));
  const homeworkIds = [
    ...new Set([...feedbackRows, ...submittedRows].map((r) => r.homeworkId)),
  ];
  const homeworks = new Map<string, string>();
  if (homeworkIds.length) {
    const { data, error } = await db
      .from("homeworks")
      .select("id,title,organization_id")
      .in("id", homeworkIds);
    if (error) throw error;
    for (const h of data ?? [])
      if (inSameSchool(h.organization_id, schoolId)) homeworks.set(h.id, h.title);
  }

  const activity = mergeActivity(
    [
      mastered.slice(0, ACTIVITY_LIMIT).flatMap((e): ActivityItem[] => {
        const lesson = lessons.get(e.lesson_id);
        if (!lesson) return [];
        return [
          {
            kind: "objective_mastered",
            at: e.created_at,
            title: e.objective_id
              ? (objectiveText.get(e.objective_id) ?? "Objective mastered")
              : "Objective mastered",
            detail: lesson.title,
          },
        ];
      }),
      (practiceRes.data ?? []).map((p): ActivityItem => {
        const pct = (p.score as { percentage?: number } | null)?.percentage;
        return {
          kind: "practice_completed",
          at: p.completedat,
          title: p.topic,
          detail: [p.subject, typeof pct === "number" ? `${pct}%` : null]
            .filter(Boolean)
            .join(" · "),
          href: "/students/practice",
        };
      }),
      (sessionsRes.data ?? []).map(
        (s): ActivityItem => ({
          kind: "tutor_session",
          at: s.created_at,
          title: s.topic,
        }),
      ),
      feedbackRows.flatMap((r): ActivityItem[] => {
        const title = homeworks.get(r.homeworkId);
        return title
          ? [
              {
                kind: "feedback_released",
                at: r.at,
                title,
                href: `/students/homework/${r.homeworkId}`,
              },
            ]
          : [];
      }),
      submittedRows.flatMap((r): ActivityItem[] => {
        const title = homeworks.get(r.homeworkId);
        return title
          ? [
              {
                kind: "homework_submitted",
                at: r.at,
                title,
                href: `/students/homework/${r.homeworkId}`,
              },
            ]
          : [];
      }),
    ],
    ACTIVITY_LIMIT,
  );

  return {
    continueLearning,
    objectivesMastered: new Set(
      mastered.map((e) => e.objective_id).filter(Boolean),
    ).size,
    activity,
  };
}

export interface TeacherDashboardData {
  studentsFallingBehind: (StudentConcern & { name: string })[];
  weakestObjectives: ObjectiveScore[];
  lessons: {
    published: number;
    unpublished: number;
    toReview: { lessonId: string; title: string; drafts: number }[];
  };
}

export const WEAK_OBJECTIVE_PERCENT = 70;

/** Dashboard insights look at homework due in this many recent days (and anything due later). */
export const INSIGHT_WINDOW_DAYS = 60;

export async function teacherDashboard(
  db: DB,
  userId: string,
  schoolId: string | null,
  now = new Date(),
): Promise<TeacherDashboardData> {
  // Older homework stays on the Homework pages; reading it here would slow the
  // dashboard down a little more every term.
  const since = new Date(now.getTime() - INSIGHT_WINDOW_DAYS * 86400000).toISOString();
  const homeworkRows = (
    await readAll((from, to) =>
      db
        .from("homeworks")
        .select("id,title,due_at,close_at,questions,objectives,organization_id")
        .eq("owner_id", userId)
        .eq("status", "published")
        .gte("due_at", since)
        .order("id")
        .range(from, to),
    )
  ).filter((h) => inSameSchool(h.organization_id, schoolId)) as (InsightHomework & {
    organization_id: string | null;
  })[];
  const ids = homeworkRows.map((h) => h.id);

  let recipients: InsightRecipient[] = [],
    attempts: InsightAttempt[] = [],
    grades: InsightGrade[] = [];
  if (ids.length) {
    // Keep each IN list short enough for a URL.
    for (let i = 0; i < ids.length; i += 100) {
      const batch = ids.slice(i, i + 100);
      const [r, a, g] = await Promise.all([
        readAll((from, to) =>
          db
            .from("homework_recipients")
            .select("homework_id,student_id,extension_at")
            .in("homework_id", batch)
            .order("homework_id")
            .order("student_id")
            .range(from, to),
        ),
        readAll((from, to) =>
          db
            .from("homework_attempts")
            .select("id,homework_id,student_id,attempt_number,submitted_at,late,revision_due_at")
            .in("homework_id", batch)
            .order("id")
            .range(from, to),
        ),
        readAll((from, to) =>
          db
            .from("homework_grades")
            .select("attempt_id,marks,released_at,released_marks,homework_attempts!inner(homework_id)")
            .in("homework_attempts.homework_id", batch)
            .order("attempt_id")
            .range(from, to),
        ),
      ]);
      recipients = recipients.concat(r as InsightRecipient[]);
      attempts = attempts.concat(a as InsightAttempt[]);
      grades = grades.concat(g as unknown as InsightGrade[]);
    }
  }

  const behind = studentsFallingBehind({
    homeworks: homeworkRows,
    recipients,
    attempts,
    grades,
    now,
  }).slice(0, 5);
  const names = new Map<string, string>();
  if (behind.length) {
    const { data, error } = await db
      .from("users")
      .select("id,name,email")
      .in("id", behind.map((b) => b.studentId));
    if (error) throw error;
    for (const u of data ?? []) names.set(u.id, u.name || u.email || "Student");
  }

  const weakest = weakestObjectives({ homeworks: homeworkRows, attempts, grades })
    .filter((o) => o.percentage < WEAK_OBJECTIVE_PERCENT)
    .slice(0, 5);

  // lessons.teacher_id points at teachers.id, not users.id.
  const { data: teacher, error: teacherError } = await db
    .from("teachers")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (teacherError) throw teacherError;
  const { data: lessonRows, error: lessonError } = teacher
    ? await db
        .from("lessons")
        .select("id,title,current_publication_id,organization_id")
        .eq("teacher_id", teacher.id)
        .is("archived_at", null)
    : { data: [], error: null };
  if (lessonError) throw lessonError;
  const lessons = (lessonRows ?? []).filter((l) =>
    inSameSchool(l.organization_id, schoolId),
  );
  const lessonIds = lessons.map((l) => l.id);
  const toReview: TeacherDashboardData["lessons"]["toReview"] = [];
  if (lessonIds.length) {
    const [artifacts, objectives] = await Promise.all([
      readAll((from, to) =>
        db
          .from("lesson_artifacts")
          .select("id,lesson_id,objective_id,series_id,version,status")
          .in("lesson_id", lessonIds)
          .order("id")
          .range(from, to),
      ),
      readAll((from, to) =>
        db
          .from("lesson_objectives")
          .select("id")
          .in("lesson_id", lessonIds)
          .is("archived_at", null)
          .order("id")
          .range(from, to),
      ),
    ]);
    const counts = draftsToReview(
      artifacts as ReviewArtifact[],
      new Set(objectives.map((o) => o.id as string)),
    );
    for (const l of lessons) {
      const n = counts.get(l.id);
      if (n) toReview.push({ lessonId: l.id, title: l.title, drafts: n });
    }
    toReview.sort((a, b) => b.drafts - a.drafts);
  }

  return {
    studentsFallingBehind: behind.map((b) => ({
      ...b,
      name: names.get(b.studentId) ?? "Student",
    })),
    weakestObjectives: weakest,
    lessons: {
      published: lessons.filter((l) => l.current_publication_id).length,
      unpublished: lessons.filter((l) => !l.current_publication_id).length,
      toReview: toReview.slice(0, 5),
    },
  };
}
